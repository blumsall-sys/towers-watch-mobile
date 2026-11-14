// Spatial bins keep foot, arrow and camera probes local to the queried segment.
export async function loadTerrain() {
    const read = async path => {
        const response = await fetch(path);
        if (!response.ok) throw Error('Cannot load ' + path);
        return response.arrayBuffer();
    };
    const [positions,elements,metadata]=await Promise.all(['dummy.vertices','dummy.indices','dummy-ground.json'].map(read));
    const v=new Float32Array(positions),indices=new Uint32Array(elements);
    const {groundIndices}=JSON.parse(new TextDecoder().decode(metadata));
    const bins = new Map(), size = 4;
    const key = (x,z) => x + ',' + z;
    for (let i=0; i<indices.length; i+=3) {
        const [a,b,c] = [indices[i]*3,indices[i+1]*3,indices[i+2]*3];
        const xs=[v[a],v[b],v[c]], zs=[v[a+2],v[b+2],v[c+2]];
        for(let x=Math.floor(Math.min(...xs)/size);x<=Math.floor(Math.max(...xs)/size);x++)
            for(let z=Math.floor(Math.min(...zs)/size);z<=Math.floor(Math.max(...zs)/size);z++){
                const k=key(x,z);
                if(!bins.has(k)) bins.set(k,[]);
                bins.get(k).push(i);
            }
    }
    // Two-sided Möller–Trumbore segment test. Return the nearest fraction.
    function ray(x,y,z,dx,dy,dz,walkable=false){
        let nearest=Infinity;
        for(let bx=Math.floor(Math.min(x,x+dx)/size);bx<=Math.floor(Math.max(x,x+dx)/size);bx++)
        for(let bz=Math.floor(Math.min(z,z+dz)/size);bz<=Math.floor(Math.max(z,z+dz)/size);bz++){
            for(const i of bins.get(key(bx,bz)) || []){
                const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
                const ex=v[b]-v[a], ey=v[b+1]-v[a+1], ez=v[b+2]-v[a+2];
                const fx=v[c]-v[a], fy=v[c+1]-v[a+1], fz=v[c+2]-v[a+2];
                if(walkable){
                    if(i>=groundIndices)continue;
                    const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx;
                    if(ny*ny<0.42*(nx*nx+ny*ny+nz*nz))continue;
                }
                const px=dy*fz-dz*fy,py=dz*fx-dx*fz,pz=dx*fy-dy*fx;
                const det=ex*px+ey*py+ez*pz;
                if(Math.abs(det)<1e-8)continue;
                const ax=x-v[a],ay=y-v[a+1],az=z-v[a+2],u=(ax*px+ay*py+az*pz)/det;
                if(u<0||u>1)continue;
                const qx=ay*ez-az*ey,qy=az*ex-ax*ez,qz=ax*ey-ay*ex;
                const w=(dx*qx+dy*qy+dz*qz)/det;
                if(w<0||u+w>1)continue;
                const t=(fx*qx+fy*qy+fz*qz)/det;
                if(t>=0&&t<=1&&t<nearest)nearest=t;
            }
        }
        return nearest;
    }
    function floor(x,y,z,depth=5){
        const t=ray(x,y,z,0,-depth,0,true);
        return Number.isFinite(t)?y-depth*t:-Infinity;
    }
    // Test an upright body as overlapping spheres, including edge and vertex
    // contacts. Ignore walkable floors here: the support probe handles steps.
    function blocked(x,y,z,height=1.76,r=.29){
        for(let bx=Math.floor((x-r)/size);bx<=Math.floor((x+r)/size);bx++)
        for(let bz=Math.floor((z-r)/size);bz<=Math.floor((z+r)/size);bz++)
        for(const i of bins.get(key(bx,bz))||[]){
            if(i<groundIndices)continue; // The continuous ground is handled by support and gravity.
            const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
            if(Math.max(v[a+1],v[b+1],v[c+1])<y+.22 || Math.min(v[a+1],v[b+1],v[c+1])>y+height)continue;
            const ex=v[b]-v[a],ey=v[b+1]-v[a+1],ez=v[b+2]-v[a+2];
            const fx=v[c]-v[a],fy=v[c+1]-v[a+1],fz=v[c+2]-v[a+2];
            const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx,nn=nx*nx+ny*ny+nz*nz;
            if(nn<1e-12)continue;
            const steps=Math.ceil((height-2*r)/.23);
            for(let h=0;h<=steps;h++){
                const cy=y+r+(height-2*r)*h/steps,ax=x-v[a],ay=cy-v[a+1],az=z-v[a+2];
                const dot=ax*nx+ay*ny+az*nz;
                if(dot*dot>=r*r*nn)continue;
                // Feet may rise over a walkable face below the lower sphere.
                if(ny*ny>=.42*nn && dot*ny>0 && h===0)continue;
                const u=((ay*fz-az*fy)*nx+(az*fx-ax*fz)*ny+(ax*fy-ay*fx)*nz)/nn;
                const w=((ey*az-ez*ay)*nx+(ez*ax-ex*az)*ny+(ex*ay-ey*ax)*nz)/nn;
                if(u>=0&&w>=0&&u+w<=1)return true;
                for(const [j,k] of [[a,b],[b,c],[c,a]]){
                    const dx=v[k]-v[j],dy=v[k+1]-v[j+1],dz=v[k+2]-v[j+2];
                    const xx=x-v[j],yy=cy-v[j+1],zz=z-v[j+2];
                    const t=Math.min(1,Math.max(0,(xx*dx+yy*dy+zz*dz)/(dx*dx+dy*dy+dz*dz||1)));
                    if((xx-dx*t)**2+(yy-dy*t)**2+(zz-dz*t)**2<r*r)return true;
                }
            }
        }
        return false;
    }
    function support(x,y,z,depth=2){
        const heights=[[0,0],[.16,0],[-.16,0],[0,.16],[0,-.16]].map(([dx,dz])=>floor(x+dx,y,z+dz,depth));
        return heights.sort((a,b)=>b-a)[1];
    }
    function stance(x,y,z,height,radius){
        const ground=support(x,y+.23,z,.54);
        if(!Number.isFinite(ground)||blocked(x,ground+.015,z,height,radius))return NaN;
        return ground;
    }
    return {ray,floor,support,blocked,stance};
}


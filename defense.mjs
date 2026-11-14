export const waves=[
    {name:'Skirmish line',count:8,hp:40,damage:12,pace:1.15},
    {name:'Double column',count:12,hp:48,damage:14,pace:1.30},
    {name:'Wedge',count:18,hp:57,damage:16,pace:1.43},
    {name:'Split wings',count:26,hp:66,damage:18,pace:1.55},
    {name:'Three-prong assault',count:36,hp:76,damage:21,pace:1.68}
];
// Compass convention follows Blender: north = +Y = PlayCanvas -Z.
export const fronts=[
    {name:'North',x:0,z:-1},{name:'East',x:1,z:0},
    {name:'South',x:0,z:1},{name:'West',x:-1,z:0}
];
const spacing=1.35;
export const knightBody={height:1.82,radius:.34};
function trace(terrain,from,to){
    let y=from.y;
    const steps=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.09);
    for(let k=1;k<=steps;k++){
        const t=k/steps,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
        y=terrain.stance(x,y,z,knightBody.height,knightBody.radius);
        if(!Number.isFinite(y))return null;
    }
    return y;
}
export function buildRoads(terrain,goal){
    const root={i:0,j:0,x:goal.x,y:goal.y,z:goal.z,links:[]},nodes=[root],cells=new Map([['0,0',root]]);
    const attempted=new Set();
    for(let k=0;k<nodes.length;k++){
        const a=nodes[k];
        for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const i=a.i+di,j=a.j+dj,id=i+','+j;
            if(Math.hypot(i,j)>26)continue;
            const edge=[a.i+','+a.j,id].sort().join('/');
            if(attempted.has(edge))continue;
            attempted.add(edge);
            const b=cells.get(id)??{i,j,x:root.x+i*spacing,z:root.z+j*spacing,links:[]};
            const y=trace(terrain,a,b);
            if(y===null||('y' in b&&Math.abs(y-b.y)>.12))continue;
            b.y??=y;
            const back=trace(terrain,b,a);
            if(back===null||Math.abs(back-a.y)>.12)continue;
            if(!cells.has(id)){cells.set(id,b);nodes.push(b);}
            a.links.push(b);b.links.push(a);
        }
    }
    return {root,nodes};
}
function shortest(start,end){
    const seen=new Map([[start,null]]),q=[start];
    for(let i=0;i<q.length&&!seen.has(end);i++)for(const b of q[i].links)if(!seen.has(b)){seen.set(b,q[i]);q.push(b);}
    const path=[];for(let n=end;n!==start;n=seen.get(n))path.push(n);
    return path.reverse();
}
// Join the graph only across a traversable segment. The final approach to
// a moving target is validated by the same stance tests used for marching.
export function routeTo(terrain,roads,from,to){
    function nearest(point,needsJoin){
        const ordered=roads.nodes.map(n=>({n,d:Math.hypot(n.x-point.x,n.z-point.z)}))
            .filter(v=>v.d<3.8).sort((a,b)=>a.d-b.d);
        return ordered.find(({n})=>!needsJoin||trace(terrain,from,n)!==null)?.n;
    }
    const start=nearest(from,true),end=nearest(to,false);
    if(!start||!end)return null;
    const path=[start,...shortest(start,end)];
    const floor=terrain.support(to.x,to.y+1,to.z,6);
    if(Number.isFinite(floor)&&trace(terrain,end,{x:to.x,z:to.z})!==null)path.push({x:to.x,y:floor,z:to.z});
    return path;
}
export function planFormation(roads,w){
    const gate=roads.root,used=new Set(),midUsed=new Set();
    const objectives=new Map();
    function slot(front,r,lateral,taken,minRange){
        const fx=front.x,fz=front.z;
        const x=gate.x+fx*r+fz*lateral,z=gate.z+fz*r-fx*lateral;
        let best,dist=Infinity;
        for(const n of roads.nodes){
            const dx=n.x-gate.x,dz=n.z-gate.z;
            const forward=dx*fx+dz*fz,side=Math.abs(dx*fz-dz*fx);
            if(taken.has(n)||forward<minRange||forward<=side)continue;
            const d=(x-n.x)**2+(z-n.z)**2;
            if(d<dist){best=n;dist=d;}
        }
        if(!best)throw Error('No reachable slot for '+front.name);
        taken.add(best);return best;
    }
    return Array.from({length:waves[w].count},(_,i)=>{
        const group=w===4?Math.floor(i/9):0;
        const front=fronts[w===4?group:w],rank=Math.floor((i%9)/3);
        const side=w===0?(i-3.5)*1.3:w===1?(i%2-.5)*2:w===2?(i%2?1:-1)*rank*1.4:(i%3-1)*2.2;
        const start=slot(front,29+rank,side,used,18);
        if(!objectives.has(front))objectives.set(front,slot(front,15,0,new Set(),8));
        const target=objectives.get(front);
        const stage=slot(front,22+rank,side*.8,midUsed,14);
        return {start,target,front,at:group*9,path:[...shortest(start,stage),...shortest(stage,target)]};
    });
}

import {createGamepadInput} from './gamepad.mjs';
import {installTouch} from './touch.mjs?v=rapid-fire';
import {VatCharacters} from './vendor/vat-characters.mjs';
import {buildRoads,planFormation,routeTo,waves,knightBody} from './defense.mjs';
import * as pc from './vendor/playcanvas.mjs';
import {loadTerrain} from './terrain.mjs';
const $=id=>document.getElementById(id);
const canvas=$('view'), start=$('start'), details=$('detail'), hud=$('hud');
const touchDevice=matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints>0 && !matchMedia('(any-pointer: fine)').matches);
document.documentElement.classList.toggle('touch',touchDevice);
const params=new URLSearchParams(location.search);
details.value=params.has('full')||params.has('preview')?'preview':params.has('mobile')||touchDevice?'mobile':'preview';
details.onchange=()=>location.search='?'+details.value;
const vec=(x=0,y=0,z=0)=>new pc.Vec3(x,y,z);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
async function boot(){
    const app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:false,alpha:false}});
    app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio,details.value==="mobile"?1:1.5);
    app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    addEventListener('resize',()=>app.resizeCanvas());
    const entity=(name,parent=app.root)=>{const e=new pc.Entity(name);parent.addChild(e);return e;};
    const camera=entity('Patrol camera');
    camera.addComponent('camera',{nearClip:.08,farClip:1300,fov:57,clearColor:new pc.Color(.39,.4,.39)});
    const sun=entity('Sun'); sun.addComponent('light',{type:'directional',intensity:1.45,color:new pc.Color(1,.88,.73)});sun.setEulerAngles(-48,32,12);
    app.scene.ambientLight=new pc.Color(.65,.67,.70);
    app.start();
    const asset=(url,type)=>new Promise((resolve,reject)=>app.assets.loadFromUrl(url,type,(err,a)=>err?reject(Error(String(err))):resolve(a)));
    const host=entity('Knight formation');
    host.addComponent('script');
    const crowd=host.script.create(VatCharacters,{properties:{
        light:sun, castShadows:false, ambientSky:new pc.Color(.64,.69,.8),
        ambientGround:new pc.Color(.40,.34,.27)
    }});
    const total=waves.reduce((sum,w)=>sum+w.count,0);
    const crowdReady=crowd.load('assets/knight.vat');
    const names=['Erika Archer With Bow Arrow','standing draw arrow','standing aim overdraw','standing aim recoil','standing aim walk forward','standing aim walk back','standing aim walk left','standing aim walk right','standing idle 01','Crouched Sneaking Right'];
    const pack=Promise.all(names.map((name,i)=>asset('assets/'+encodeURIComponent(i===0&&details.value==="mobile"?"archer-mobile":name)+'.glb','container')));
    const [terrain,container,splat,placement,crouchAsset,gear,arrowAsset]=await Promise.all([loadTerrain(),asset('archer-tracks.glb','container'),
        asset(details.value==='mobile'?'village-mobile-v2.compressed.ply':'village-full-v2.compressed.ply','gsplat'),fetch('placement.json').then(r=>r.json()),asset('crouch.glb','container'),pack,asset('assets/arrow.glb','container'),crowdReady]);
    crowd.capacity=waves.at(-1).count;crowd.count=0;
    const durations=Object.fromEntries(crowd.animations.map(a=>[a.name,a.duration]));
    // The capture panorama covers any residual transparency at the scan edge.
    const backdrop=entity('Village panorama');
    const panorama=(await asset('village-panorama.jpg','texture')).resource;
    const materialSky=new pc.StandardMaterial();
    materialSky.useLighting=false;
    materialSky.emissive.set(1,1,1);
    materialSky.emissiveMap=panorama;
    materialSky.cull=pc.CULLFACE_NONE;
    materialSky.depthWrite=false;
    materialSky.update();
    const positions=[],uvs=[],indices=[];
    for(let row=0;row<=32;row++){
        const latitude=Math.PI*(row/32-.5);
        for(let col=0;col<=64;col++){
            const angle=(.30-col/64)*Math.PI*2;
            positions.push(800*Math.cos(latitude)*Math.sin(angle),800*Math.sin(latitude),800*Math.cos(latitude)*Math.cos(angle));
            uvs.push(col/64,row/32);
            if(row<32&&col<64){const i=row*65+col;indices.push(i,i+1,i+65,i+1,i+66,i+65);}
        }
    }
    const dome=new pc.Mesh(app.graphicsDevice);
    dome.setPositions(positions);dome.setUvs(0,uvs);dome.setIndices(indices);dome.update();
    backdrop.addComponent('render',{meshInstances:[new pc.MeshInstance(dome,materialSky)],castShadows:false,receiveShadows:false});
    const village=entity('Medieval Village Sunset');
    const matrix=new pc.Mat4().set(placement[0].map((_,i)=>placement.map(row=>row[i])).flat());
    village.setPosition(matrix.getTranslation());village.setRotation(new pc.Quat().setFromMat4(matrix));
    village.addComponent('gsplat',{asset:splat});
    const player=entity('Archer'), model=gear[0].resource.instantiateRenderEntity();
    player.addChild(model);model.addComponent('anim',{activate:true});
    const tracks=container.resource.animations.map(a=>a.resource);
    const crouchTrack=crouchAsset.resource.animations[0].resource;
    tracks.push(crouchTrack);
    tracks.push(...gear.slice(1).map(a=>a.resource.animations[0].resource));
    for(const track of tracks)model.anim.assignAnimation(track.name,track,undefined,1,!['standing aim recoil','standing draw arrow','standing aim overdraw'].includes(track.name));
    const nock=model.findByName('mixamorig:LeftHand'),heldArrow=model.findByName('Erika_Archer_Arrow_Mesh');
    function material(r,g,b){const m=new pc.StandardMaterial();m.diffuse.set(r,g,b);m.update();return m;}
    const wood=material(.43,.22,.08), gold=material(.88,.72,.39), red=material(.53,.10,.065);
    function shape(parent,type,mat,sx,sy,sz,x=0,y=0,z=0){
        const e=entity(type,parent);e.addComponent('render',{type});e.render.meshInstances[0].material=mat;
        e.setLocalScale(sx,sy,sz);e.setLocalPosition(x,y,z);return e;
    }
    const nocked=arrowAsset.resource.instantiateRenderEntity();app.root.addChild(nocked);
    const keys=new Set(), enemies=[], arrows=[];
    let yaw=0,pitch=-.085,face=0,vy=0,grounded=true,crouch=false,charge=-1,mode='Idle',clip='',score=0,wave=0,passed=0;
    const p=vec(),aim=vec(), focus=vec(), origin=vec();
    function home(){p.set(0,terrain.support(0,2,8,6),8);vy=0;grounded=true;yaw=0;pitch=-.085;face=0;}
    home();
    let pending=[],waveClock=0;const banners=new Map();
    let health=100, vitality=100, resolved=0, invulnerable=0, timer=6, recoil=0, finished=false;
    const gate=vec(-1,terrain.support(-1,2,9,6),9);
    const roads=buildRoads(terrain,gate);
    const effects=[];
    function impact(at,amount,hurt=false,follow=null,remaining=null){
        const label=document.createElement('b');label.className='impact'+(hurt?' hurt':'');
        label.textContent='−'+amount;
        if(remaining!==null){
            const bar=document.createElement('progress');bar.max=waves[wave-1].hp;bar.value=remaining;
            label.append(bar);
        }
        $('feedback').append(label);
        effects.push({label,at:at.clone(),follow,age:0});
        if(!hurt)$('ret').animate([{transform:'translate(-50%,-50%) scale(2.6)',borderColor:'#ffd16e'},{transform:'translate(-50%,-50%) scale(1)'}],180);
        else $('wound').animate([{opacity:.85},{opacity:0}],400);
    }
    function feedback(dt){
        for(let i=effects.length-1;i>=0;i--){
            const fx=effects[i];fx.age+=dt;
            if(fx.age>.72){fx.label.remove();effects.splice(i,1);continue;}
            const at=fx.follow?.parent?fx.follow.getPosition().clone().add(vec(0,1.72,0)):fx.at.clone();
            at.y+=fx.age*.75;const screen=camera.camera.worldToScreen(at);
            fx.label.hidden=screen.z<=0;fx.label.style.left=screen.x+'px';fx.label.style.top=screen.y+'px';
            fx.label.style.opacity=Math.min(1,(.72-fx.age)*4);
            if(fx.age<.17){
                const color=new pc.Color(1,.78,.37);
                for(let j=0;j<6;j++){const angle=j*Math.PI/3,r=.07+fx.age*1.5;
                    const d=vec(Math.cos(angle)*r,Math.sin(angle)*r,.025);
                    app.drawLine(fx.at.clone().add(d.clone().mulScalar(.4)),fx.at.clone().add(d),color);}
            }
        }
    }
    function inReach(q,target,radius){
        const dx=target.x-q.x,dz=target.z-q.z,dy=target.y-q.y;
        return Math.hypot(dx,dz)<=radius&&Math.abs(dy)<1.45&&terrain.ray(q.x,q.y+.92,q.z,dx,dy,dz)===Infinity;
    }
    const flag=entity('Tower standard');flag.setPosition(gate);
    shape(flag,'cylinder',wood,.10,3,.10,0,1.5,0);
    shape(flag,'box',red,.85,.59,.05,.42,2.55,0);
    shape(flag,'box',gold,.13,.59,.06,.32,2.55,0);
    function bearingTo(banner){
        const q=banner.getPosition();
        const angle=yaw-Math.atan2(q.x-p.x,q.z-p.z);
        return ['↑','↗','→','↘','↓','↙','←','↖'][(Math.round(angle/(Math.PI/4))%8+8)%8];
    }
    function restart(){
        for(const group of [enemies,arrows])while(group.length)remove(group,group.length-1);
        pending=[];waveClock=0;for(const b of banners.values())b.destroy();banners.clear();flag.enabled=true;crowd.count=0;health=vitality=100;resolved=invulnerable=0;
        for(const fx of effects)fx.label.remove();effects.length=0;wave=score=passed=0;timer=5;finished=false;recoil=0;charge=-1;crouch=false;home();
        $('status').textContent='';
    }

    let touchPlaying=false,padPlaying=false,started=false,pad=null,aiming=false;
    const readPad=createGamepadInput();
    let lastStartTouch=touchDevice;
    start.addEventListener('pointerdown',e=>{lastStartTouch=e.pointerType==='touch';});
    const locked=()=>document.pointerLockElement===canvas;
    const active=()=>touchPlaying||padPlaying||locked();
    function sync(){
        const on=active();
        $('menu-title').textContent=finished?'Defense complete':started&&!on?'Paused':'Towers Watch';
        $('reset-game').hidden=!started||on||finished;
        $('pad-pause').hidden=!padPlaying||locked();
        aiming=false;
        document.documentElement.classList.toggle('touch-playing',touchPlaying);
        $('overlay').hidden=on;hud.hidden=!on;$('feedback').hidden=!on;$('ret').hidden=!on;
        $('controls').hidden=!touchPlaying;$('return-home').hidden=on||!touchDevice||finished;
        keys.clear();touch.reset();charge=-1;start.textContent=finished?'Play again':'Resume defense';
    }
    function pause(){
        touchPlaying=false;padPlaying=false;
        if(locked())document.exitPointerLock();else sync();
    }
    function jump(){if(grounded){vy=6.4;grounded=false;}}
    function sneak(){if(!crouch||!terrain.blocked(p.x,p.y+.015,p.z,1.82,.32))crouch=!crouch;}
    function look(x,y){if(active()){yaw-=x*.003;pitch=clamp(pitch-y*.0026,-1.05,.95);}}
    function draw(){if(active()&&recoil<=0&&(!crouch||!terrain.blocked(p.x,p.y+.015,p.z,1.82,.32))){crouch=false;charge=0;}}
    function release(){if(active()&&charge>=0){shoot();charge=-1;recoil=.16;}}
    const touch=installTouch({stick:$('stick'),canvas,fire:$('fire'),look,draw,release,cancel:()=>charge=-1});
    $('jump').onclick=jump;$('sneak').onclick=sneak;$('pause').onclick=pause;
    async function enter(input,reset=false){
        if(finished||reset)restart();
        started=true;touchPlaying=input==='touch';padPlaying=input==='pad';
        if(input!=='pad')lastStartTouch=touchPlaying;
        document.documentElement.classList.toggle('touch',touchPlaying);
        if(touchPlaying||padPlaying)sync();
        else try{await canvas.requestPointerLock();}catch(err){$('status').textContent=err.message;}
    }
    $('return-home').onclick=()=>{home();enter('touch');};
    $('pad-pause').onclick=pause;
    start.disabled=false;start.textContent='Enter the village';
    start.onclick=()=>enter(lastStartTouch?'touch':'mouse');
    $('reset-game').onclick=e=>enter(e.pointerType==='touch'||(!e.pointerType&&lastStartTouch)?'touch':'mouse',true);
    document.addEventListener('pointerlockchange',()=>{
        if(locked()){padPlaying=false;touchPlaying=false;}
        sync();
    });
    canvas.addEventListener('pointerdown',e=>{
        if(padPlaying&&e.pointerType==='mouse'&&!locked())enter('mouse');
    });
    function pollController(dt){
        const connected=!!pad;
        pad=readPad();
        if(connected!==!!pad)$('pad-help').hidden=!pad;
        if(!pad){aiming=false;if(connected)charge=-1;if(padPlaying)pause();return;}
        if(document.hidden||!document.hasFocus())return;
        if(!active()){
            if(pad.pressed(9)||pad.pressed(0))enter('pad');
            else if(started&&!finished&&pad.pressed(3))enter('pad',true);
            return;
        }
        if(pad.pressed(9)){pause();return;}
        aiming=!!pad.held[6];
        yaw-=pad.look[0]*dt*(aiming?1.3:2.7);
        pitch=clamp(pitch-pad.look[1]*dt*(aiming?1:2),-1.05,.95);
        if(pad.pressed(0))jump();
        if(pad.pressed(1))sneak();
        if(pad.pressed(3))home();
        if(pad.pressed(7))draw();
        if(pad.released(7))release();
        if(pad.pressed(2)&&charge<0){draw();release();}
    }
    addEventListener('blur',()=>{if(active())pause();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&active())pause();});
    addEventListener('mousemove',e=>{if(locked())look(e.movementX*.77,e.movementY*.77);});
    addEventListener('keydown',e=>{
        if(!active())return;e.preventDefault();keys.add(e.code);if(e.repeat)return;
        if(e.code==='KeyC')sneak();
        if(e.code==='Space')jump();
        if(e.code==='KeyR')home();
        if(e.code==='KeyP'||(e.code==='Escape'&&!locked()))pause();
        if(e.code==='KeyF'&&!enemies.length&&!pending.length&&wave<5){formation();timer=5;}
    });
    addEventListener('keyup',e=>keys.delete(e.code));
    addEventListener('mousedown',e=>{if(locked()&&e.button===0)draw();});
    addEventListener('mouseup',e=>{if(locked()&&e.button===0)release();});
    function formation(){
        wave++;
        for(const b of banners.values())b.destroy();banners.clear();
        pending=planFormation(roads,wave-1).map((slot,i)=>({...slot,i}));
        waveClock=0;flag.enabled=false;deploy();
    }
    function deploy(){
        const spec=waves[wave-1];
        while(pending.length&&pending[0].at<=waveClock){
            const {start,path,front,target,i}=pending.shift();
            let banner=banners.get(front.name);
            if(!banner){banner=flag.clone();app.root.addChild(banner);banner.name=front.name+' tower standard';
                banner.setPosition(target.x,target.y,target.z);banner.enabled=true;banners.set(front.name,banner);}
            const objective=banner.getPosition().clone();
            const e=entity('Knight');e.setPosition(start.x,start.y,start.z);
            e.setEulerAngles(0,Math.atan2(gate.x-start.x,gate.z-start.z)*180/Math.PI,0);
            const speed=spec.pace*(.82+((i*5)%11)*.036);
            enemies.push({e,path,index:0,clip:'Idle',age:0,phase:(i*.381)%1,
                delay:.32+Math.floor(i/6)*.25,scale:1.04+(i%5)*.018,speed,hunter:i%3!==0,goal:'flag',replan:.1+i*.04,
                objective,front:front.name,hp:spec.hp,damage:spec.damage,contact:false,breached:false});
        }
        drawKnights();
    }
    function animate(knight,clip){
        knight.clip=clip;knight.age=0;knight.phase=0;
    }
    function drawKnights(){
        crowd.count=enemies.length;
        // Repack live slots after removals. Simulation time owns both the
        // attack contact and the VAT frame, including when the game is paused.
        enemies.forEach((u,i)=>{
            const looping=u.clip==='Idle'||u.clip==='March';
            crowd.setTransform(i,u.e.getPosition(),u.e.getRotation(),u.scale);
            crowd.setAnimation(i,u.clip,0,looping,u.phase+u.age*(u.clip==='March'?u.speed:1));
        });

    }
    function remove(list,i){list[i].e.destroy();list.splice(i,1);}
    function shotVelocity(){
        const eye=camera.getPosition(),d=camera.forward.clone(),reach=42;
        const wall=terrain.ray(eye.x,eye.y,eye.z,d.x*reach,d.y*reach,d.z*reach);
        const target=eye.clone().add(d.mulScalar(reach*Math.min(1,wall)));
        return target.sub(origin).normalize().mulScalar(33+19*clamp(charge,0,1));
    }
    function shoot(){
        // Resolve fast taps even when both mouse events arrive between frames.
        face=yaw;player.setEulerAngles(0,face*180/Math.PI,0);view();
        const shoulder=p.clone().add(vec(0,1.35,0)),offset=origin.clone().sub(shoulder);
        if(terrain.ray(shoulder.x,shoulder.y,shoulder.z,offset.x,offset.y,offset.z)<1)return;
        const e=arrowAsset.resource.instantiateRenderEntity();app.root.addChild(e);e.setPosition(origin);
        const v=shotVelocity();e.lookAt(origin.clone().add(v));arrows.push({e,v,age:0,damage:Math.round(28+36*clamp(charge,0,1))});
    }
    function walk(dx,dz){
        if(!dx&&!dz)return;
        const x=p.x+dx,z=p.z+dz;
        const height=crouch?1.24:1.82;
        const stand=grounded?terrain.stance(x,p.y,z,height,.32):NaN;
        if(Number.isFinite(stand)){p.set(x,stand,z);return;}
        const floor=terrain.support(x,p.y+.24,z,35);
        if(!Number.isFinite(floor)||grounded&&floor>=p.y-.30)return;
        const base=grounded&&floor>p.y?floor:p.y;
        if(terrain.blocked(x,base+.015,z,height,.32))return;
        if(grounded && floor>p.y)p.y=floor;
        p.x+=dx;p.z+=dz;
    }
    function move(dt){
        const fore=touch.axis.y||-(pad?.move[1]||0)||Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
        const side=touch.axis.x||pad?.move[0]||Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
        const moving=!!(fore||side),run=(pad&&Math.hypot(...pad.move)>.55)||Math.hypot(touch.axis.x,touch.axis.y)>.57||keys.has('ShiftLeft')||keys.has('ShiftRight'),sprint=run&&fore>0&&(pad?.held[10]||touch.axis.y>.88||keys.has('KeyE'));
        mode=!grounded?'Jump':crouch?'Crouch':!moving?'Idle':sprint?'Sprint':run?'Run':'Walk';
        const speed=crouch?1.25:sprint?6.5:run?4:2;
        const distance=speed*dt/Math.max(1,Math.hypot(fore,side));
        const dx=(Math.sin(yaw)*fore-Math.cos(yaw)*side)*distance;
        const dz=(Math.cos(yaw)*fore+Math.sin(yaw)*side)*distance;
        const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.075));
        for(let i=0;i<steps;i++){walk(dx/steps,0);walk(0,dz/steps);}
        if(aiming||charge>=0||recoil>0||crouch)face=yaw;else if(moving)face=Math.atan2(dx,dz);
        const ground=terrain.support(p.x,p.y+.27,p.z,40);
        if(grounded&&ground<p.y-.32)grounded=false;
        if(grounded&&Number.isFinite(ground))p.y=ground;
        if(!grounded){
            vy-=15*dt;
            if(vy>0&&terrain.ray(p.x,p.y+(crouch?1.15:1.75),p.z,0,vy*dt+.04,0)<1)vy=0;
            const height=crouch?1.24:1.82;
            const travel=vy*dt,parts=Math.max(1,Math.ceil(Math.abs(travel)/.055));
            for(let k=0;k<parts;k++){
                const y=p.y+travel/parts;
                if(vy<=0&&y<=ground){p.y=ground;grounded=true;vy=0;break;}
                if(terrain.blocked(p.x,y+.015,p.z,height,.32)){vy=0;break;}
                p.y=y;
            }
        }
        if((grounded||vy<=0)&&p.y<=ground+.08){p.y=ground;vy=0;grounded=true;}
        if(p.y < -50)home();
        let next=!grounded?'RUNNING JUMP':crouch?(side>0&&!fore?'Crouched Sneaking Right':crouchTrack.name):moving&&!run?'WALKING':moving?'RUNNING':'standing idle 01';
        if(recoil>0)next='standing aim recoil';
        else if(charge>=0){
            next=charge<.54?'standing draw arrow':moving?'standing aim walk '+(fore>0?'forward':fore<0?'back':side>0?'right':'left'):'standing aim overdraw';
        }
        if(next!==clip){
            model.anim.baseLayer.transition(next,crouch&&!moving?0:.09);
            if(crouch&&!moving)model.anim.baseLayer.activeStateCurrentTime=.24;
            clip=next;
        }
        model.anim.speed=charge>=0?(next==='standing draw arrow'?4.2:1):recoil>0?1.5:crouch&&!moving?0:sprint?1.45:1;
        if(heldArrow)heldArrow.enabled=false;
        player.setPosition(p);player.setEulerAngles(0,face*180/Math.PI,0);
    }
    function view(){
        aim.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
        focus.copy(p).add(vec(-Math.cos(yaw)*.46,crouch?1.1:1.47,Math.sin(yaw)*.46));
        const boom=aim.clone().mulScalar(aiming||charge>=0?-2.45:-3.7);
        const t=terrain.ray(focus.x,focus.y,focus.z,boom.x,boom.y,boom.z);
        const eye=focus.clone().add(boom.mulScalar(Math.max(.04,Math.min(1,t-.055))));
        backdrop.setPosition(eye);camera.setPosition(eye);camera.lookAt(eye.clone().add(aim));
        origin.copy(p).add(vec(Math.sin(yaw)*.64,crouch?.99:1.37,Math.cos(yaw)*.64));
        nocked.enabled=charge>=0;
        if(nocked.enabled){
            origin.copy(nock.getPosition());
            const dir=shotVelocity().normalize();
            nocked.setPosition(origin);nocked.lookAt(origin.clone().add(dir));
        }
    }
    function advance(dt){
        for(let i=enemies.length-1;i>=0;i--){
            const u=enemies[i],q=u.e.getPosition();
            u.age+=dt;
            if(u.clip==='Fall'||u.clip==='Collapse'){
                if(u.age>=durations[u.clip]+.25)remove(enemies,i);
                continue;
            }
            if(u.clip==='Idle'){
                if(u.age>=u.delay)animate(u,'March');
                continue;
            }
            if(u.clip==='Attack'){
                if(!u.contact&&u.age>=durations.Attack*.40){
                    u.contact=true;
                    if(u.target==='player'&&invulnerable<=0&&inReach(q,p,1.85)){
                        vitality=Math.max(0,vitality-u.damage);invulnerable=.45;
                        impact(p.clone().add(vec(0,1.2,0)),u.damage,true,player);
                    }else if(u.target==='tower'&&inReach(q,u.objective,1.9)){
                        health=Math.max(0,health-u.damage);passed++;resolved++;u.breached=true;
                        impact(u.objective.clone().add(vec(0,2,0)),u.damage,true);
                    }
                }
                if(u.age>=durations.Attack){
                    if(u.breached)remove(enemies,i);else animate(u,'March');
                }
                continue;
            }
            const playerClose=inReach(q,p,1.65),towerClose=inReach(q,u.objective,1.40);
            if(playerClose||towerClose){
                const target=playerClose?p:u.objective;u.target=playerClose?'player':'tower';
                u.contact=false;u.e.setEulerAngles(0,Math.atan2(target.x-q.x,target.z-q.z)*180/Math.PI,0);
                animate(u,'Attack');continue;
            }
            u.replan-=dt;
            const distance=Math.hypot(p.x-q.x,p.z-q.z);
            const hunt=u.hunter&&distance<(u.goal==='player'?17:13);
            const newGoal=hunt?'player':'flag';
            if((newGoal!==u.goal||hunt)&&u.replan<=0&&(!u.path[u.index]||u.index===0||u.atNode)){
                const path=routeTo(terrain,roads,q,hunt?p:u.objective);
                if(path){u.path=path;u.index=Math.hypot(path[0].x-q.x,path[0].z-q.z)<.02?1:0;u.goal=newGoal;}
                u.replan=.8;
            }
            const dest=u.path[u.index];
            if(!dest){u.replan=0;continue;}
            const dx=dest.x-q.x,dz=dest.z-q.z,dist=Math.hypot(dx,dz);
            if(dist<.001){u.index++;u.atNode=true;continue;}
            u.atNode=false;
            const step=Math.min(dist,dt*u.speed),parts=Math.ceil(step/.06);
            for(let k=0;k<parts;k++){
                const here=u.e.getPosition(),x=here.x+dx/dist*step/parts,z=here.z+dz/dist*step/parts;
                const ground=terrain.stance(x,here.y,z,knightBody.height,knightBody.radius);
                if(!Number.isFinite(ground))break;
                u.e.setPosition(x,ground,z);
            }
            u.e.setEulerAngles(0,Math.atan2(dx,dz)*180/Math.PI,0);
        }
        for(let i=arrows.length-1;i>=0;i--){
            const a=arrows[i],q=a.e.getPosition().clone(),d=a.v.clone().mulScalar(dt);
            d.y-=4*dt*dt;a.v.y-=8*dt;a.age+=dt;
            let nearest=terrain.ray(q.x,q.y,q.z,d.x,d.y,d.z),hit=-1;
            for(let j=0;j<enemies.length;j++){
                const target=enemies[j];
                if(target.clip==='Fall'||target.clip==='Collapse'||target.breached)continue;
                const center=target.e.getPosition().clone().add(vec(0,.82*target.scale,0));
                const t=clamp(center.clone().sub(q).dot(d)/Math.max(.00001,d.lengthSq()),0,1);
                const offset=q.clone().add(d.clone().mulScalar(t)).sub(center);
                if(t<nearest&&Math.hypot(offset.x,offset.z)<.39&&Math.abs(offset.y)<.85){nearest=t;hit=j;}
            }
            if(hit>=0){
                const knight=enemies[hit],loss=Math.min(knight.hp,a.damage);
                knight.hp-=loss;impact(q.clone().add(d.clone().mulScalar(nearest)),loss,false,knight.e,knight.hp);
                if(knight.hp===0){score++;resolved++;animate(knight,score%2?'Collapse':'Fall');}
            }
            if(nearest<=1||a.age>4){remove(arrows,i);continue;}
            q.add(d);a.e.setPosition(q);a.e.lookAt(q.clone().add(a.v));
        }
    }
    function preview(){
        let q=origin.clone(),v=shotVelocity();const color=new pc.Color(1,.8,.36);
        for(let i=0;i<32;i++){
            const d=v.clone().mulScalar(.055);d.y-=4*.055*.055;v.y-=8*.055;
            const t=terrain.ray(q.x,q.y,q.z,d.x,d.y,d.z),end=q.clone().add(d.mulScalar(Math.min(t,1)));
            if(i%2===0||t<=1)app.drawLine(q,end,color,false);
            if(t<=1)break;q=end;
        }
    }
    move(0);view();
    app.on('update',elapsed=>{
        const dt=Math.min(elapsed,.06);
        pollController(dt);
        if(!active()||finished)return;
        if(charge>=0)charge=Math.min(1,charge+dt/.42);
        invulnerable=Math.max(0,invulnerable-dt);move(dt);view();advance(dt);feedback(dt);drawKnights();if(charge>=0)preview();
        recoil=Math.max(0,recoil-dt);
        waveClock+=dt;if(pending.length)deploy();
        if(!enemies.length&&!pending.length){
            timer-=dt;
            if(timer<=0&&wave<5){formation();timer=5;}
        }
        if(vitality<=0||health<=0||(wave>=5&&!enemies.length&&!pending.length)){
            finished=true;$('status').textContent=(vitality<=0?'The archer fell.':health<=0?'The standard fell.':'Tower defended.')+' Defeated '+score+' knights. Level progress '+resolved+'/'+total+'.';
            pause();return;
        }
        $('player-hp').value=vitality;$('tower-hp').value=health;
        $('player-count').textContent=vitality+'/100';$('tower-count').textContent=health+'/100';
        $('level').value=resolved;$('progress-count').textContent=resolved+' / '+total;
        $('wave').textContent=wave?'Wave '+wave+' / 5 · '+waves[wave-1].name+' · '+[...new Set(enemies.filter(u=>!u.breached&&u.hp>0).map(u=>u.front))].join(' + '):'Preparing defense';
        const goals=[...banners.entries()].filter(([name])=>enemies.some(u=>u.front===name&&u.hp>0&&!u.breached));
        $('orders').textContent=goals.map(([name,b])=>bearingTo(b)+' '+name+' standard '+Math.round(p.distance(b.getPosition()))+' m').join(' · ')+(pending.length?' · '+pending[0].front.name+' in '+Math.ceil(pending[0].at-waveClock)+'s':'');
        $('combat-state').textContent=(enemies.length?enemies.filter(u=>u.hp>0&&!u.breached).length+' incoming':'Next wave in '+Math.ceil(timer)+'s')+' · '+score+' defeated · '+mode+(charge>=0?' · Draw '+Math.round(charge*100)+'%':'');


    });

}
boot().catch(e=>{$('status').textContent='Could not start the patrol. '+e.message;start.textContent='Load failed';console.error(e);});

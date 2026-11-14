export function createGamepadInput(){
    let previous=[],index=null;
    const radial=(x=0,y=0)=>{
        const length=Math.hypot(x,y);
        if(length<=.17)return [0,0];
        const gain=Math.min(1,(length-.17)/.83)/length;
        return [x*gain,y*gain];
    };
    return ()=>{
        let pads;
        try{pads=Array.from(navigator.getGamepads?.()||[]);}
        catch{pads=[];}
        const supported=pads.filter(p=>p?.connected&&p.mapping==='standard');
        const engaged=p=>p.buttons.some(b=>b.pressed)||p.axes.some(v=>Math.abs(v)>.22);
        const pad=supported.find(p=>p.index===index&&engaged(p))||supported.find(engaged)||supported.find(p=>p.index===index)||supported[0];
        if(!pad){index=null;previous=[];return null;}
        if(index!==pad.index)previous=[];
        index=pad.index;
        const held=pad.buttons.map(b=>b.pressed||b.value>.35);
        const last=previous;previous=held;
        return {move:radial(...pad.axes.slice(0,2)),look:radial(...pad.axes.slice(2,4)),
            held,pressed:i=>held[i]&&!last[i],released:i=>!held[i]&&last[i]};
    };
}

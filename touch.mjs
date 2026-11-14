export function installTouch({stick, canvas, fire, look, draw, release, cancel}) {
    const axis = {x:0, y:0};
    const knob = stick.firstElementChild;
    const owners = new Map();
    // Pointer events drive these three surfaces. Cancel their native touch
    // gestures as well, including Safari's double-tap zoom on button release.
    const suppressGesture = event => {
        if (document.documentElement.classList.contains('touch-playing') && event.cancelable) {
            event.preventDefault();
        }
    };
    for (const surface of [fire, canvas, stick]) {
        for (const type of ['touchstart', 'touchend']) {
            surface.addEventListener(type, suppressGesture, {passive:false});
        }
    }
    for (const type of ['gesturestart', 'gesturechange', 'dblclick']) {
        document.addEventListener(type, suppressGesture, {capture:true, passive:false});
    }
    function track(element, start, move, end) {
        element.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse' || owners.has(element)) return;
            e.preventDefault();
            owners.set(element,e.pointerId);
            element.setPointerCapture(e.pointerId);
            start(e);
        });
        element.addEventListener('pointermove', e => {
            if (owners.get(element) === e.pointerId) move(e);
        });
        for (const type of ['pointerup','pointercancel','lostpointercapture']) {
            element.addEventListener(type, e => {
                if (owners.get(element) !== e.pointerId) return;
                owners.delete(element);
                end(type === 'pointerup');
            });
        }
    }
    function center(){
        axis.x=axis.y=0;
        knob.style.transform='translate(0,0)';
    }
    function steer(e){
        const r=stick.getBoundingClientRect();
        const x=e.clientX-r.left-r.width/2, y=e.clientY-r.top-r.height/2;
        const radius=r.width*.36, length=Math.hypot(x,y), scale=Math.max(radius,length);
        axis.x=length>5?x/scale:0; axis.y=length>5?-y/scale:0;
        knob.style.transform='translate('+axis.x*radius+'px,'+(-axis.y*radius)+'px)';
    }
    track(stick,steer,steer,center);
    for(const element of [canvas,fire]){
        let x,y;
        track(element,e=>{x=e.clientX;y=e.clientY;if(element===fire)draw();},
            e=>{look(e.clientX-x,e.clientY-y);x=e.clientX;y=e.clientY;},
            completed=>{if(element===fire){if(completed) release();else cancel();}});
    }
    return {axis,reset(){owners.clear();center();}};
}

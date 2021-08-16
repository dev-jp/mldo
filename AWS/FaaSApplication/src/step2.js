'use strict';

module.exports.handler = async(event) => {
    // TODO implement
    //console.log(event);
    console.log("invoked step2!")
    console.time('step-2-local');
    
    const radius = event.radius;
    const space = radius*radius*Math.PI;
    await step2Timeout(2000);
    
    console.timeEnd('step-2-local');
    //console.log(response);
    return { 
        "radius": radius, 
        "space": space
    };
}

function step2Timeout(ms) {
  //20210519console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      //20210519console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

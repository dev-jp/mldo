'use strict';

module.exports.handler = async(event) => {
    // TODO implement
    //console.log(event);
    console.log("invoked step3!")
    console.time('step-3-local');
    
    const radius = event.radius;
    const volumn = calculateVolumn(radius);
    await step3Timeout(500);
    
    console.timeEnd('step-3-local');
    //console.log(response);
    return { 
        "radius": radius, 
        "volumn": volumn
    };
}

function calculateVolumn(radius) {
    return 4/3*radius*radius*radius*Math.PI;
}

function step3Timeout(ms) {
  //20210519console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      //20210519console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}
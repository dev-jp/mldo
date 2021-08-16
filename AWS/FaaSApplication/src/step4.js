'use strict';

module.exports.handler = async(event) => {
    // TODO implement
    console.log("invoked step4!")
    console.time('step-4-local');
    const radius = event.radius;
    await step4Timeout(500);
    console.timeEnd('step-4-local');
    //console.log(response);
    return { 
        "radius": radius, 
    };
}

function step4Timeout(ms) {
  //20210519console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      //20210519console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}
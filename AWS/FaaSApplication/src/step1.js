module.exports.handler = async(event) => {
    // TODO implement
    //console.log(event);
    console.log("invoked step1!")
    console.time('step-1-local');
    const radius = event.radius;
    const circumference = 2*radius*Math.PI
    
    const fb = fibo(45);
    //await step1Timeout(15000);
    console.timeEnd('step-1-local');
    
    return { 
        "radius": radius, 
        "circumference": circumference
    };
}

const fibo = (n) => {
	if (n < 2){
		return 1;
	}else{
		return fibo(n - 2) + fibo(n - 1);
	}
}

function step1Timeout(ms) {
  //20210519console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      //20210519console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}
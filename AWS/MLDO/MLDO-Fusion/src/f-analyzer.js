'use strict';
const AWS = require("aws-sdk");
const cloudwatchlogs = new AWS.CloudWatchLogs({ region: "eu-north-1", });
const weight = 0.5;

module.exports.handler = async(event, context) => {
    const fnPreName = 'mldo-tcc-';
    const objStructure = JSON.parse(event[0].payloads[0]).mldoStrategy.objStructure;
    const arrStructure = objToArr(objStructure);
    
    try {
        let results = {};
        
        const matrix = initializeMatrix(event);
        
        for (let fn of arrStructure) {
            let fnName = fnPreName + fn.Name;
            let logs = await getCWLLogEvents(fnName);
            results[fn.Name] = logs;
            //20210519console.log(`${fnName}'s log is ${JSON.stringify(results[fn.Name])}`);
        }
        
        //20210519console.log(`After For Loop, the logs is${JSON.stringify(results)}`);
        
        const analysis = runAnalysisV2(results, matrix);
        //20210519console.log(`post analysis, results is ${JSON.stringify(analysis)}`);
        
        const cheapest =  pickTheBest(analysis, "cost");
        //const dearest =  pickTheBest(analysis, "expensive");
        const balanced = pickTheBest(analysis, "balanced");
        const fastest =  pickTheBest(analysis, "duration");
        //const slowest =  pickTheBest(analysis, "slow");
        //console.log(`The cheapest solution is ${JSON.stringify(cheapest)}`);
        //console.log(`The fastest solution is ${JSON.stringify(fastest)}`);

        return {analysis, cheapest, balanced, fastest};
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};

const pickTheBest = (analysis, criteria="duration") => {
    let temp;
    let eclipse = 9999999999;
    let cost = 9999999999;
    let expensive = 0;
    let slowest = 0;

    if(criteria == "duration"){
        //pick the fastest solution
        for(let solution in analysis){
            if(eclipse > analysis[solution].Eclipse){
                eclipse = analysis[solution].Eclipse;
                temp = analysis[solution];
            }
        }
    }else if (criteria == "cost"){
        //pick the cheapest solution
        for(let solution in analysis){
            if(cost > analysis[solution].Cost){
                cost = analysis[solution].Cost;
                temp = analysis[solution];
            }
        }
    }else if (criteria == "expensive"){
        //pick the most expensive solution
        for(let solution in analysis){
            if(expensive < analysis[solution].Cost){
                expensive = analysis[solution].Cost;
                temp = analysis[solution];
            }
        }
    }else if (criteria == "slow"){
        //pick the slowest solution
        for(let solution in analysis){
            if(slowest < analysis[solution].Cost){
                slowest = analysis[solution].Cost;
                temp = analysis[solution];
            }
        }
    }else if (criteria == "balanced"){
        let balanced = 1.1;
        //pick the balanced solution, weight=0.5
        for(let solution in analysis){
            if(balanced > analysis[solution].Balanced){
                balanced = analysis[solution].Balanced;
                temp = analysis[solution];
            }
        }
    }
    return temp;    
}

const initializeMatrix = (event) => {
    let results = {};

    for (let deployment of event) {
        const strategy = JSON.parse(deployment.payloads[0]).mldoStrategy;
        const groups = strategy.groups;
        const traceID = strategy.traceID;

        if (results[traceID] == undefined) {
            results[traceID] = {};
        }
        if(results[traceID]['results'] == undefined){
            results[traceID]['results'] = {};
        }
        let partitions = '';
        for (let group in groups) {
            results[traceID]['results'][groups[group].entry] = { cost: -1, duration: -1, coldStart: -1, eclipse: -1 };
            partitions += JSON.stringify(groups[group].group);
        }
        results[traceID]['partitions'] = partitions;
    }
    //console.log(`init matrix is ${JSON.stringify(results)}`);
    return results;
};

//logGroup->logStreams->logEvents
const getCWLLogEvents = async(fnName) => {
    console.log(`inside Fn:getCWLLogEvents, fetching logs of ${fnName}`);
    //TODO validate input data
    const logGroupName = `/aws/lambda/${fnName}`;

    const paramsLogStreams = {
        logGroupName,
        orderBy: "LastEventTime",
        descending: true
    };

    const re = await cloudwatchlogs.describeLogStreams(paramsLogStreams).promise();
    const logStreams = re.logStreams;

    //console.log(`logStreams length is ${logStreams.length}`);

    let results = [];
    for (let logStream of logStreams) {

        let paramsLogEvents = {
            logGroupName,
            logStreamName: logStream.logStreamName
        };

        let latestLogStream = await cloudwatchlogs.getLogEvents(paramsLogEvents).promise();
        //console.log(latestLogStream);
        results.push(latestLogStream);
    }
    //console.log(`still inside Fn:getCWLLogEvents, ${fnName}'s log ${JSON.stringify(results)}`);
    return results;
};

const runAnalysisV2 = (logs, matrix) => {
    //console.log(`inside Fn:runAnalysis, running analysis on ${logs} with ${matrix}`);
    if (logs.length == 0) {
        return matrix;
    }

    for (let fnLogs in logs) {
        //fnLogs => 'step1'
        let concatLogs = [];
        for (let log of logs[fnLogs]) {
            concatLogs = concatLogs.concat(log.events);
        }
        //TODO go through step1 logs
        let tempLogs = concatLogs.values();
        
        let tempLog = tempLogs.next();
        
        let startTimeIndex = 0;
        startTimeIndex++;//for getting startTime
        
        while (!tempLog.done) {
            let startTime, endTime;
            
            //1.find "MLDO traceID"
            if (tempLog.value.message.includes("MLDO traceID")) {
                let traceID = /MLDO traceID (.*)/.exec(tempLog.value.message)[1];

                if (matrix[traceID] == undefined) {
                    tempLog = tempLogs.next();
                    startTimeIndex++;//for getting startTime
                    continue;
                } else/* if(matrix[traceID][fnLogs]) */{
                    //console.log(`startTimeIndex is ${startTimeIndex}`);
                    //console.log(`target-2 is ${JSON.stringify(concatLogs[startTimeIndex-2])}`);
                    startTime = concatLogs[startTimeIndex-2].timestamp;//index-1-1
                    
                    tempLog = tempLogs.next();
                    startTimeIndex++;//for getting startTime
                    
                    while(!tempLog.value.message.startsWith("REPORT")){
                        tempLog = tempLogs.next();
                        startTimeIndex++;//for getting startTime
                    }//end of small while
                    
                    if(tempLog.value.message.startsWith("REPORT")){
                        //console.log(`${fnLogs}'s value is ${JSON.stringify(tempLog.value)}`);
                         
                        endTime = parseInt(tempLog.value.timestamp);
                        //console.log(`${fnLogs}'s endTime is ${endTime}`);
                        //console.log(`${fnLogs}'s endTime is ${endTime}, startTime is ${startTime}.`);
                        
                        const {billedDuration, memorySize, coldStart} = abstractDataFromLog(tempLog.value.message);
                        
                        if (matrix[traceID]['results'][fnLogs].cost > 0) {
                            matrix[traceID]['results'][fnLogs].cost = (matrix[traceID]['results'][fnLogs].cost + calculateCost(memorySize, billedDuration)) / 2;
                        }
                        else if (matrix[traceID]['results'][fnLogs].cost < 0) {
                            matrix[traceID]['results'][fnLogs].cost = calculateCost(memorySize, billedDuration);
                        }
                        
                        if (matrix[traceID]['results'][fnLogs].duration > 0) {
                            matrix[traceID]['results'][fnLogs].duration = (matrix[traceID]['results'][fnLogs].duration + billedDuration) / 2;
                        }
                        else if (matrix[traceID]['results'][fnLogs].duration < 0) {
                            matrix[traceID]['results'][fnLogs].duration = billedDuration;
                        }
                        
                        if (matrix[traceID]['results'][fnLogs].coldStart > 0) {
                            matrix[traceID]['results'][fnLogs].coldStart = (matrix[traceID]['results'][fnLogs].coldStart + coldStart) / 2;
                        }
                        else if (matrix[traceID]['results'][fnLogs].coldStart < 0) {
                            matrix[traceID]['results'][fnLogs].coldStart = coldStart;
                        }
                        
                        //just for single test
                        //TODO 
                        matrix[traceID]['results'][fnLogs].startTime = startTime;
                        matrix[traceID]['results'][fnLogs].endTime = endTime;
                        if(!isNaN(startTime)&&!isNaN(endTime)){
                            matrix[traceID]['results'][fnLogs].eclipse = endTime - startTime;
                        }
                    }
                }
            }
            tempLog = tempLogs.next();
            startTimeIndex++;
        }//end of big while
    }
    //console.log(`matrix is ${matrix}`);
    return getFinalResults(matrix);
};

const getFinalResults = matrix =>{
    
    for(let traceID in matrix){
        
        let results = matrix[traceID].results;
        let totalCost = 0;
        let totalDuration = 0;
        let totalColdStart = 0;
        let eclipse = 0;
        let startTime = 9999999999999; //13digits
        let endTime = 0;
        
        for(let fn in results){
            if(results[fn].cost<0 || results[fn].duration<0){
                totalCost = 9999999999;
                totalCost += 9999999999;
                totalDuration += 9999999999;
            }else{
                totalCost += results[fn].cost;
                totalDuration += results[fn].duration;
                totalColdStart += results[fn].coldStart;
            }
            
            //eclipse of whole applications
            if(results[fn].startTime < startTime){
                startTime = results[fn].startTime;
            }
            if(results[fn].endTime > endTime){
                endTime = results[fn].endTime;
            }
        }
        
        matrix[traceID]['Cost'] = totalCost;
        matrix[traceID]['Duration'] = totalDuration;
        matrix[traceID]['ColdStart'] = totalColdStart;
        matrix[traceID]['Eclipse'] = endTime-startTime;
    }
    
    // compute max cost and max eclipse
    let tempCostArray = [];
    let tempEclipseArray = [];
    for(let traceID in matrix){
        tempCostArray.push(matrix[traceID]['Cost']);
        tempEclipseArray.push(matrix[traceID]['Eclipse']);
    }
    
    console.log(`cost array is ${tempCostArray}, eclipse array is ${tempEclipseArray}`);
    
    const maxCost = Math.max(...tempCostArray);
    const maxEclipse = Math.max(...tempEclipseArray);
    
    console.log(`maxCost is ${maxCost}, maxEclipse is ${maxEclipse}`);
    
    for(let traceID in matrix){
        // formula for balanced value of a configuration ( value is minimized )
        let balanced = weight * matrix[traceID]['Cost'] / maxCost + (1 - weight) * matrix[traceID]['Eclipse'] / maxEclipse;
        matrix[traceID]['Balanced'] = balanced; 
    }
    
    return matrix;
};

const abstractDataFromLog = log => {
    const parts = log.replace("\n", "").split("\t");
    //const requestId = /REPORT RequestId: (.*)/.exec(parts[0])[1];
    //const duration = parseFloatWith(/Duration: (.*) ms/i, parts[1]);
    const billedDuration = parseFloatWith(/Billed Duration: (.*) ms/i, parts[2]);
    const memorySize = parseFloatWith(/Memory Size: (.*) MB/i, parts[3]);
    //const memoryUsed = parseFloatWith(/Max Memory Used: (.*) MB/i, parts[4]);
    
    let coldStart;
    if (parts[5]) {
        coldStart = parseFloatWith(/Init Duration: (.*) ms/i, parts[5]) || 0;
    }
    return {billedDuration, memorySize, coldStart};
}

const calculateCost = (RAM, Duration) => {
    //$0.20 per 1M requests
    const priceRequests = 0.2 / 1000000;
    //$0.0000166667 for every GB-second
    const priceDuration = 0.0000166667 * (RAM / 1024) * (Duration / 1000);
    return (priceDuration + priceRequests);
};

const objToArr = obj => {
    let arr = [];
    for (let o in obj) {
        arr.push(obj[o]);
    }
    return arr;
};

const parseFloatWith = (regex, input) => {
    const res = regex.exec(input);
    return parseFloat(res[1]); //parse a string to float, return a number or NaN
};

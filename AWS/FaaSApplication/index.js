'use strict';
const AWS = require("aws-sdk");
const lambda = new AWS.Lambda({ region: "eu-north-1" });

exports.handler = async(event, context) => {
    //20210519console.log(`inside index.js, event is ${JSON.stringify(event)}`);
    //for PowerTuning testing
    if (!event.mldoStrategy) {
        //20210519console.log(`inside index.js, no strategy passed in, local invoking step1`);
        let nextPayload = await invokeLocal("step1", event);
        return nextPayload;
    }
    else {
        //task 1. get strategy, and log traceID
        let [payload, mldoStrategy, mldoTarget] = pre(event);
        let traceID = mldoStrategy.traceID;
        let objStructure = mldoStrategy.objStructure;
        let groups = mldoStrategy.groups;
        let thisTarget = mldoTarget;

        console.log(`MLDO traceID ${traceID}`); //Must Keep

        //task 2. local require target => do business
        console.time('local');
        let nextPayload = await invokeLocal(thisTarget, event);
        //console.log(`nextPayload is ${JSON.stringify(nextPayload)}`);
        console.timeEnd('local');
        
        //task 3. invoke next
        let nextTarget = findNext(thisTarget, mldoStrategy);//"step2" or ["step2", "ste"]
        
        if (nextTarget) {
            //20210519console.log(`inside index.js, invokeing ${JSON.stringify(nextTarget)}`);
            console.time('next');
            let nextInvocation = await invokeNext(thisTarget, nextTarget, nextPayload, mldoStrategy);
            console.timeEnd('next');
            return nextInvocation;
        }else{
            return 'Executor OK';    
        }
    }
    
};

const invokeNext = async (thisTarget, nextTarget, nextPayload, mldoStrategy) => {
    let objStructure = mldoStrategy.objStructure;

    //single + remote invoke
    if (typeof(nextTarget) == "string" && objStructure[thisTarget].groupID !== objStructure[nextTarget].groupID) {
        nextPayload['mldoStrategy'] = mldoStrategy;
        nextPayload['mldoTarget'] = nextTarget;
        //20210519console.log(`Inside Fn:invokeNext, single+remote, from ${thisTarget} -> next ${nextTarget} with payload ${JSON.stringify(nextPayload)}`);
        
        let remoteInvocation = await invokeRemote(thisTarget, nextTarget, nextPayload, mldoStrategy);
        return remoteInvocation;
    }
    //single + local invoke
    else if (typeof(nextTarget) == "string" && objStructure[thisTarget].groupID == objStructure[nextTarget].groupID) {
        //console.log(`Inside Fn:invokeNext, single+local invoke from ${thisTarget} -> next ${nextTarget} with payload ${nextPayload}`);
        
        nextPayload = await invokeLocal(nextTarget, nextPayload);
        
        thisTarget = nextTarget;
        nextTarget = findNext(nextTarget, mldoStrategy);
        if (nextTarget) {
            let next = await invokeNext(thisTarget, nextTarget, nextPayload, mldoStrategy);
            return next;
        }else{
            return;
        }
        
    }
    //mulitple next targets
    else if (typeof(nextTarget) == "object") {
        //20210519console.log(`Inside Fn:invokeNext, multiple invokes from ${thisTarget} -> next ${nextTarget} with payload ${nextPayload}`);
        const invokeMultiple = nextTarget.map(async(nextT) => {
            //20210519console.log(`Inside Fn:invokeNext, multiple invokes -> for loop,  from ${thisTarget} -> next ${nextT} with payload ${nextPayload}`);
            await invokeNext(thisTarget, nextT, nextPayload, mldoStrategy);
        });
        await Promise.all(invokeMultiple);
        return;
    }
    //in case all fail
    else{
        return;
    }
    
    //20210519! return;
};

const pre = (event) => {
    return [event.payload, event.mldoStrategy, event.mldoTarget];
};

const invokeLocal = async (target, payload) => {
    //console.log(`inside Fn: invokeLocal, invoking ${target} with payload: ${payload}`);
    const { handler } = require(`./src/${target}`);
    const response = await handler(payload);
    //console.log(`invokeLocal, the response from ${target} is ${JSON.stringify(response)}`);
    return response;
};

const invokeRemote = async(thisFunction, target, payload, mldoStrategy) => {
    //20210519console.log(`Fn:invokeRemote => remote invoking from ${thisFunction} -> ${target}`);
    //console.log(`Fn:invokeRemote => mldoStrategy is ${JSON.stringify(mldoStrategy)}`);
    //console.log(`Fn:invokeRemote => payload is ${JSON.stringify(payload)}`);

    try {
        let nextARN = mldoStrategy.objStructure[target].ARN;
        let alias = 'mldo-' + mldoStrategy.traceID;
        payload["mldoStrategy"] = mldoStrategy;
        payload["mldoTarget"] = target;

        //console.log(`params payload is ${JSON.stringify(nextPayload)}`);
        let params = {
            FunctionName: nextARN,
            Qualifier: alias,
            InvocationType: 'Event',
            Payload: JSON.stringify(payload),
            LogType: 'Tail', // will return logs
        };
        //20210519console.log(`Fn:invokeRemote => remote invoke params is ${JSON.stringify(params)}`);
        //const invoke = await lambda.invoke(params).promise();
        let invokeR = await lambda.invoke(params).promise();
        await Promise.all([invokeR]);
        //20210519console.log(`Fn:invokeRemote => remote invoke return is ${JSON.stringify(invokeR)}`);
        return invokeR;
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};

const findNext = (thisFunction, mldo) => {
    return mldo.objStructure[thisFunction].next;
};

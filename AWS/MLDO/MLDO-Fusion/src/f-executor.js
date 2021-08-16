"use strict";
const ptUtils = require('../lib/ptUtils');
const utils = require('../lib/utils');

module.exports.handler = async(event, context) => {
    console.log(`inside f-executor, event is ${event}`);
    const invokeTimes = 1; //how many times each strategies will be tried.
    //event = mockEvent;
    let [traceID, arrStructure, objStructure, groups] = [event.traceID, event.arrStructure, event.objStructure, event.groups];

    //Task 2. get Entry function of the FaaS Application
    const objFirstFunction = utils.getStartFunction(arrStructure);
    /*
    {
        Name: 'step1',
        lambdaARN: 'arn:aws:lambda:eu-north-1:856424392177:function:mldo-tcc-step1',
        pre: '',
        next: 'step2',
        payload: { radius: 10 },
        RAM: 160,
        duration: 2.3066666666666666,
        groupID: 'G-0'
    }
    */
    //Task 3. invoke "Entry" function with ${invokeTimes}
    objFirstFunction.payload["mldoStrategy"] = { traceID, objStructure, groups };
    objFirstFunction.payload["mldoTarget"] = objFirstFunction.Name;
    const payloads = ptUtils.generatePayloads(invokeTimes, objFirstFunction.payload);

    //invokeInParallel(num, lambdaARN, lambdaAlias, payloads, preProcessorARN, postProcessorARN);
    const invokeResult = await invokeInParallel(
        invokeTimes,
        groups[objFirstFunction.groupID].entryARN,
        groups[objFirstFunction.groupID].alias,
        payloads
    );

    return { payloads };
};

//detect if a function is grouped with other functions
//in group => true, single => false
const isInGroup = (arrPartitions, fnName) => {
    let re = true;
    let RAM = 0;
    arrPartitions.forEach(element => {
        if (element.length == 1 && element == fnName) {
            re = false;
            //RAM = ele
        }
        else if (element.length > 1) {

        } //TODO
    });
    return re;
};


const invokeInParallel = async(num, lambdaARN, lambdaAlias, payloads) => {
    const results = [];
    // run all invocations in parallel ...
    const invocations = ptUtils.range(num).map(async(_, i) => { //range(n) = [0,1,2,3,...,n], i = index, _ = item
        const {invocationResults, actualPayload} = await ptUtils.mldoInvokeLambda(lambdaARN, lambdaAlias, payloads[i]);
        //console.log(`invoke ${counter}`);counter++;
        results.push(invocationResults);
    });
    await Promise.all(invocations);
    return results;
};

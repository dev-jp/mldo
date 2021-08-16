'use strict';

const ptUtils = require('../lib/ptUtils');

module.exports.handler = async(event, context) => {
    //const handler = async (event) => {
    //console.log(event[0].payloads);
    let versions = [];
    try {
        for (let e of event) {
            
            if (typeof(e.payloads[0]) == 'string') {
                const deployment = JSON.parse(e.payloads[0]);
                const strategy = deployment.mldoStrategy;
                const groups = strategy.groups;
                const arrGroups = objToArr(groups);

                //remove alias
                await Promise.all(
                    arrGroups.map(async group => {
                        let ARN = group.entryARN;
                        let alias = group.alias;
                        const re = await cleanUpAlias(ARN, alias);
                        versions.push({ 'ARN': ARN, 'Version': re });
                    })
                );
            }
        }
        
        await Promise.all(
            versions.map(async version => {
                await cleanUpVersion(version['ARN'], version['Version'])
            })
        );
    }catch(error) {
        console.error(error);
        throw error;
    }
    return event;
};

const cleanUpAlias = async(lambdaARN, alias) => {
    try {
        // check if it exists and fetch version ID
        const { FunctionVersion } = await ptUtils.getLambdaAlias(lambdaARN, alias);
        //console.log(`clean up alias ${alias} @version ${FunctionVersion}`);
        await ptUtils.deleteLambdaAlias(lambdaARN, alias);
        return FunctionVersion;
    }
    catch (error) {
        if (error.code === 'ResourceNotFoundException') {
            console.error('OK, even if version/alias was not found');
            console.error(error);
        }
        else {
            console.error(error);
            throw error;
        }
    }
};

const cleanUpVersion = async(lambdaARN, FunctionVersion) => {
    try {
        // check if it exists and fetch version ID
        //console.log(`clean up version ${FunctionVersion}`);
        await ptUtils.deleteLambdaVersion(lambdaARN, FunctionVersion);
    }
    catch (error) {
        if (error.code === 'ResourceNotFoundException') {
            console.error('OK, even if version/alias was not found');
            console.error(error);
        }
        else {
            console.error(error);
            throw error;
        }
    }
};

const objToArr = obj => {
    let arr = [];
    for (let o in obj) {
        arr.push(obj[o]);
    }
    return arr;
};

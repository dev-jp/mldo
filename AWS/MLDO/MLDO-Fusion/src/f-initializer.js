'use strict';
const utils = require('../lib/utils');
const ptUtils = require('../lib/ptUtils');
//const { handler } = require('./f-executor');

/**
 * main function
 * 1. get Power Tuning output (structure with Optimized RAM)
 * 2. Use structure.Name to generate all partitions
 */
module.exports.handler = async(event, context) => {
    //module.exports.handler = async (input) => {//for local development use
    const ptOutput = event.output; //aws use
    //const ptOutput = input.output;//for local development use

    const arrStructure = []; //FaaS Application structure with opitimized RAM value

    //pre-structured the deployment json file, with finest granuliarty. 
    ptOutput.map((val) => {
        var Name = val.Input.Name;
        var ARN = val.Input.lambdaARN;
        var pre = val.Input.pre;
        var next = val.Input.next;
        var payload = val.Input.payload;
        var RAM = (val.Output.power) ? val.Output.power : val.Input.optimizedRAM;
        var duration = val.Output.duration;

        var step = { Name, ARN, pre, next, payload, RAM, duration };
        arrStructure.push(step);
    });

    const objStructure = utils.arrToObj(arrStructure);

    if (arrStructure.length == 0) {
        return;
    }

    const arr = [];
    arrStructure.map((val) => {
        arr.push(val.Name);
    });
    //const allPartitions = utils.getPartitions(arr);
    const allPartitionsDebug = utils.getPartitions(arr);
    const allPartitions = allPartitionsDebug.reverse();
    
    //console.log(`allPartitions is ${allPartitions}`);
    const allStrategies = utils.generateAllStrategies(allPartitions, arrStructure, objStructure);
    //console.log(`allStrategies is ${allStrategies}`);

    //apply constraints, e.g. total duration should not exceed 15mins...
    const strategiesBeforeLocalDijkstra = utils.applyConstraints(allStrategies);
    //console.log(`strategies is ${JSON.stringify(strategiesBeforeLocalDijkstra)}`);

    //local calculation to rule out some strategies before running test
    //const strategies = localTest(strategiesBeforeLocalDijkstra);
    const strategies = strategiesBeforeLocalDijkstra;
    
    //memory setup
    //Task 1. set up the testing env
    //task 1.1 get entry of each group
    //task 1.2 get current RAM settings
    //task 1.3 set new RAM settings
    //task 1.4 reset to original RAM
    //for running in sequence, use normal for loop, 
    //for running in parallel, use Rromise.all(Array.map())
    
    for(let strategy of strategies) {
        //console.log(`forEach strategy is ${JSON.stringify(strategy)}`);
        let traceID = strategy.traceID;
        let groups = strategy.groups;
        //console.log(`strategy groups is ${JSON.stringify(groups)}`)
        //set memeory
        for (let groupID in groups) {
            //console.log(`obj for...loop, groupID is ${groupID}`);
            //task 1.1 get entry of each group
            //task 1.2 get current RAM settings
            const originalRAM = await ptUtils.getLambdaPower(groups[groupID].entryARN);
            //console.log(`orginalRAM of ${groupID} is ${originalRAM} MB`);
            
            //task 1.3 set new RAM settings
            const alias = `mldo-${traceID}`;
            //console.log(`alias of ${groupID} is ${alias}`);
            await ptUtils.createPowerConfiguration(groups[groupID].entryARN, groups[groupID].optimizedRAM, alias);

            //task 1.4 reset to original RAM
            await ptUtils.setLambdaPower(groups[groupID].entryARN, originalRAM);

            //task 1.5 update groups obj with originalRAM and alias
            groups[groupID]["originalRAM"] = originalRAM;
            groups[groupID]["alias"] = alias;
        }
    }
    
    //console.log(strategies.length);

    return strategies;
};

const localTest = (strategies) => {
    let tempStrategies = [];
    let strategyIndex = 0;
    let tempArray = []; //store strategyIndex -> tempCost;
    
    strategies.forEach((strategy) => {
        let totalCost = 0;

        //calculate 
        strategy.partitions.forEach(partition => {
            const partitionCost = calculatePartitionCost(strategy, partition);
            totalCost += partitionCost;
        });

        //update the cost array, cost <-> strategy
        tempArray.push(totalCost);
        //console.log(`strategy is ${strategy.partitions}, cost is ${totalCost}`);
    });

    //set threadhold as 5% more than cheapest
    const cheapest = Math.min(...tempArray);
    const barCost = 1.05 * cheapest;

    //console.log(`cheapest is ${cheapest}, barCost is ${barCost}`);
    console.log(`tempArray is ${tempArray}`);
    
    //any strategy with 5% more than cheapest, remove!
    tempArray.forEach((tempCost, index) => {
        if (tempCost <= barCost) {
            tempStrategies.push(strategies[index]);
        }
    });
    
    console.log(`before Dijkstra strategies is ${strategies.length}, after is ${tempStrategies.length}`);

    return tempStrategies;
};

const calculatePartitionCost = (strategy, partition) => {
    let cost = 0;
    if (partition.length == 1) {
        let ram = getOptimalRAMByFunctionName(strategy, partition[0]);
        let duration = getDurationByFunctionName(strategy, partition[0]);
        cost = ram * duration;
        //console.log(`calculate Cost, partition is ${partition}, cost is ${cost}`);
    }
    else if (partition.length == 2) {
        let ram1 = getOptimalRAMByFunctionName(strategy, partition[0]);
        let duration1 = getDurationByFunctionName(strategy, partition[0]);
        let ram2 = getOptimalRAMByFunctionName(strategy, partition[1]);
        let duration2 = getDurationByFunctionName(strategy, partition[1]);
        cost = ram1 * duration1 + ram2 * duration2;
        //console.log(`calculate Cost, partition is ${partition}, cost is ${cost}`);
    }
    else if (partition.length > 2) {
        cost = localDijkstra(strategy, partition);
        console.log(`calculate Cost, partition is ${partition}, cost is ${cost}`);
    }
    return cost;
};

const localDijkstra = (strategy, partition) => {
    //Dijkstra longest edge from start->end
    //1. form the graph
    const graph = createGraphForDijkstra(strategy, partition);
    
    //2. calculate the longest 
    let duration = dijkstra(graph);

    let ram = getOptimalRAMByFunctionName(strategy, partition[0]);
    let cost = ram * duration;
    
    console.log(`partition dijkstra, partition ${partition}, duration ${duration}, ram ${ram}, cost ${cost}`);
    return cost;
};

const getOptimalRAMByFunctionName = (strategy, functionName) => {
    let groupID = strategy.objStructure[functionName].groupID;
    return strategy.groups[groupID].optimizedRAM;
};

const getDurationByFunctionName = (strategy, functionName) => {
    
    return strategy.objStructure[functionName].duration;
};

const getNextByFunctionName = (strategy, functionName) => {
    return strategy.objStructure[functionName].next;
};

const getPreByFunctionName = (strategy, functionName) => {
    return strategy.objStructure[functionName].pre;
};

const getEntryByFunctionName = (strategy, functionName) => {
    let groupID = strategy.objStructure[functionName].groupID;
    return strategy.groups[groupID].entry;
};

const createGraphForDijkstra = (strategy, partition) => {
    const graph = {};

    let entry = getEntryByFunctionName(strategy, partition[0]);
    //console.log(`entry is ${entry}`);
    //console.log(`strategy is ${JSON.stringify(strategy.objStructure[functionName].duration)}`);
    graph['start'] = {};
    graph['start'][entry] = -1*getDurationByFunctionName(strategy, entry);//always single entry

    partition.forEach(fn=>{
        let next= getNextByFunctionName(strategy, fn);
        
        if (typeof(next) == 'object') {
            graph[fn] = {};
            //multiple next
            next.forEach(n=>{
                if(partition.includes(n)){
                    graph[fn][n] = -1*getDurationByFunctionName(strategy, n);
                }
            });
        } 
        else if (next == '') {
            graph[fn] = {};
            //no next
            graph[fn] = {'finish': 0}
        } 
        else if (partition.includes(next)){
            graph[fn] = {};
            graph[fn][next] = -1*getDurationByFunctionName(strategy, next);
        }
        else {
            graph[fn] = {};
            graph[fn] = {'finish': 0}
        }
    });
    graph['finish'] = {};
    //console.log(`graph is ${JSON.stringify(graph)}`);
    return graph;
};

//reference https://hackernoon.com/how-to-implement-dijkstras-algorithm-in-javascript-abdfd1702d04
const lowestCostNode = (costs, processed) => {
    return Object.keys(costs).reduce((lowest, node) => {
        if (lowest === null || costs[node] < costs[lowest]) {
            if (!processed.includes(node)) {
                lowest = node;
            }
        }
        return lowest;
    }, null);
};

// function that returns the minimum cost and path to reach Finish
const dijkstra = (graph) => {
    // track lowest cost to reach each node
    const costs = Object.assign({ finish: Infinity }, graph.start);

    // track paths
    const parents = { finish: null };
    for (let child in graph.start) {
        parents[child] = 'start';
    }

    // track nodes that have already been processed
    const processed = [];

    let node = lowestCostNode(costs, processed);

    while (node) {
        let cost = costs[node];
        let children = graph[node];
        for (let n in children) {
            let newCost = cost + children[n];
            if (!costs[n]) {
                costs[n] = newCost;
                parents[n] = node;
            }
            if (costs[n] > newCost) {
                costs[n] = newCost;
                parents[n] = node;
            }
        }
        processed.push(node);
        node = lowestCostNode(costs, processed);
    }

    let optimalPath = ['finish'];
    let parent = parents.finish;
    while (parent) {
        optimalPath.push(parent);
        parent = parents[parent];
    }
    optimalPath.reverse();
    
    const results = {distance: costs.finish, path: optimalPath};
    console.log(`graph is ${JSON.stringify(graph)}, result is ${JSON.stringify(results)}`);
    
    return -1 * (costs.finish);
};

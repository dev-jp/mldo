const { v4: uuidv4 } = require('uuid');

module.exports.generateTraceID = () => {
    return uuidv4();
};

module.exports.getPartitions = (arrStructure) => {
    return partitions(arrStructure);
};

module.exports.arrToObj = arr => {
    var obj = {};
    arr.forEach(e => obj[e.Name] = e);
    return obj;
};

module.exports.ojbToArr = obj => {
    let arr = [];
    for (let o in obj) {
        arr.push(obj[o]);
    }
    return arr;
};

/**
 * Apply constraints on generated strategy, constraints shall be evolved
 * 0. remove partitions with any "Loop"
 * 1. sum of durations < 15 mins
 * 2. generate traceID for each partition
 */
//module.exports.applyConstraints = (arrAllPartitions, arrStructure, objStructure)=>{
module.exports.applyConstraints = (allStrategies) => {
    console.log("before " + allStrategies.length);
    const re = allStrategies.filter(strategy => {
        var removeOrKeep = true;//true keep, false remove
        if (!checkJumpBack(strategy.partitions, strategy.objStructure) ||
            !checkDoubleEntry(strategy.partitions, strategy.objStructure) ||
            !checkTimeOut(strategy.partitions, strategy.arrStructure)) 
        {
            removeOrKeep = false;
            //console.log(`${JSON.stringify(strategy.partitions)} is ${removeOrKeep}`);
        }
        return removeOrKeep;
    });
    console.log("after " + re.length);
    return re;
};

module.exports.generateAllStrategies = (arrAllPartitions, arrStructure, objStructure) => {
    let reFinal = [];
    arrAllPartitions.forEach((partitions) => {
        //console.log(`- partitions ${partitions}`);
        //2. generate groups{groupID:{entry:"first fn in the partitions", ARN:"first fn ARN", RAM, "optimized RAM", ... group:[]}}
        let objGroups = {};
        let groupID = "G-0";
        //partitions => [['step1','step2'], ['step3']]

        partitions.forEach(group => {
            //console.log(`-- group ${group}`);
            //group => ['step1','step2']
            //group => ['step3']
            objGroups[groupID] = {
                "groupID": groupID,
                "entry": group[0],
                "entryARN": objStructure[group[0]]["ARN"],
                "optimizedRAM": calculateRAM(partitions, objStructure, group[0]),
                "group": group
            };
            //3. assign groupID to structure object
            group.forEach(fn => {
                //console.log(`--- fn ${fn}`);
                objStructure[fn]["groupID"] = groupID;
                //console.log(`${objStructure[fn].Name}'s groupID is ${objStructure[fn].groupID}`)
            });
            //generate next groupID
            groupID += "0";
            //console.log("- "+JSON.stringify(objStructure));
        });

        const tempObjStructure = deepCopy(objStructure);
        const tempArrStructure = deepCopy(arrStructure);
        //4. generate traceID to each partition
        reFinal.push({
            "traceID": uuidv4(),
            "partitions": partitions,
            "arrStructure": tempArrStructure,
            "objStructure": tempObjStructure,
            "groups": objGroups
        });
    });
    return reFinal;
};

//each function in the group should have at least one connector in the group
const checkJumpBack = (partitions, objStructure) => {
    let keepOrRemove = true;//true keep, false remove
    //true keep, false remove, use for the whole partition
    for(let index = 0; index < partitions.length; index++){
        let group = partitions[index];
        
		let passOrFail = false;//true pass, false fail, use for each group

        if(group.length == 1){
            //single function pass
            passOrFail = true;
            continue;
        }

        if (group.length !== 1) {
            //multiple functions in the group
            for(let i = 0; i<group.length; i++){
				//[1, 3, 4],[2]
				let pre = objStructure[group[i]].pre;
				let next = objStructure[group[i]].next;

                let j = 0;
                while (j < group.length){
                    if(j == i){
                        j++;
                        continue;
                    }
					if(arrCompare(pre, group[j]) || arrCompare(next, group[j])){
                        //at least another function is connected to this function
                        passOrFail = true;
						break;
					}
                    j++;
				}

                if(!passOrFail){
                    keepOrRemove = false;
                    break;
                }
			}
            if(!keepOrRemove){
                break;
            }
        }
    }
    return keepOrRemove;
};

//each group should not have more than ONE "pre" from outside
const checkDoubleEntry = (partitions, objStructure) => {
    let keepOrRemove = true;//true keep, false remove

    for (let index = 0; index < partitions.length; index++) {
        let group = partitions[index];
        let passOrFail = false;//true pass, false fail, use for each group

        if (group.length == 1) {
            //single function pass
            passOrFail = true;
            continue;
        }

        let entryCounter = 0;
        if (group.length !== 1) {
            //multiple functions in the group
            //there should be no more than ONE outside "pre"
            for (let i = 0; i < group.length; i++) {
                let pre = objStructure[group[i]].pre;
                //pre outside => counter++, pre inside => counter no change
                if(!group.some(fn=>pre==fn)){
                    entryCounter++;
                }
            }
            if(entryCounter>1){
                keepOrRemove = false;
                break;
            }
        }
    }
    return keepOrRemove;
};

//total duration of a group should not exceed 15mins
const checkTimeOut = (partition, arrStructure) => {
    let durationLimit = 900000; //15mins*60s/min*1000ms/s

    let removeOrKeep = true;//true:keep false:remove
    //for-loop the group
    partition.map((group) => {
        var durationSum = 0;
        group.forEach((funstionName) => {
            durationSum += parseFloat(getValueFromStructure(arrStructure, funstionName, "duration"));
        });
        if (durationSum > durationLimit) {
            //remove the partition where the group is in
            removeOrKeep = false;
        }
    });
    return removeOrKeep;
};

//when multiple functions in same deployment group, assign the RAM with 1.3x biggest RAM
const calculateRAM = (arrPartitions, objStructure, fnName) => {
    var [sum, biggest, optimized] = [0, 0, 0];
    arrPartitions.some(group => {
        if (group.find(fn => fn == fnName)) {
            //find the group where fnName belongs, calculate RAM
            group.forEach((fn) => {
                sum += objStructure[fn].RAM;
                biggest = (objStructure[fn].RAM > biggest) ? objStructure[fn].RAM : biggest;
            });
            //if just 1 function in group, the RAM to RAM of that function; if multiple, set to 1.3x biggest RAM
            //optimized = (group.length > 1) ? parseInt(biggest * 1.3, 10) : biggest;
            optimized = (group.length > 1) ? parseInt(biggest , 10) : biggest;
            optimized = (optimized>1792) ? 1792 : optimized;//1 vCPU requires 1792MB, nodejs single core
            return true;
        }
    });
    //return [biggest, sum, optimized];
    return optimized;
};

const getValueFromStructure = (arrStructure, functionName, key) => {
    let re;
    arrStructure.every((element) => {
        if (element.Name == functionName) {
            re = element[key];
            return false;
        }
        return true;
    });
    return re;
};

const partitions = (arrStructure) => {
    var results = [];

    if (arrStructure.length == 0) {
        results.push([[]]);
        return results;
    }

    if (arrStructure.length == 1) {
        results.push(new Array(arrStructure));
        return results;//[[[1]]]
    }

    var last = arrStructure[arrStructure.length - 1];
    var sub = partitions(arrStructure.slice(0, arrStructure.length - 1));//remove the last item

    //partitions(2) => [ [ [ 's1', 's2' ] ], [ [ 's1' ], [ 's2' ] ] ]
    //val => [ [ 's1', 's2' ] ] or [ [ 's1' ], [ 's2' ] ]
    //set => [ 's1', 's2' ] or [ 's1' ], [ 's2' ]
    sub.map((partition) => {
        //val => each partition
        //1) insert the "last" into each set, together with the rest of sets in the same partition makes a new partition
        partition.map((set) => {
            //set=>each set of one particular partition
            set.push(last);//reference, no need to take pre/post, update/deep copy/pop
            results.push(deepCopy(partition));
            set.pop();
        });
        //2), insert the "last" as a singlton set into the partition, make it a new partition
        partition.push([last]);
        results.push(deepCopy(partition));
        partition.pop();
    });
    //return all possible partitions
    return results;
};

const deepCopy = val => {
    return JSON.parse(JSON.stringify(val));
};

//get the "entry" function out of the given structure
const getStartFunction = arrStructure => {
    return arrStructure.find(element => element.pre == "");
};
const getLastFunction = arrStructure => {
    return arrStructure.find(element => element.next == "");
};

const getFnFromArray = (arrStructure, fnKey = "", fnValue = "") => {
    return arrStructure.find(element => element.fnKey == fnValue);
};

const getFnFromObject = (objStructure, fnName, fnKey) => {
    return objStructure[fnName][fnKey];
};

const setFnInObject = (obj, fnName, fnKey, fnValue) => {
    obj[`${fnName}`][`${fnKey}`] = fnValue;
};

const arrCompare = (arr, str) => {
    let re = false;
    if(typeof(arr) !== "string" ){
        arr.forEach(element => {
            if(element == str){
                re = true;
            }
        });
    }else{
        re = (arr == str) ? true : false;
    }
    return re;
};

exports.handler = async(event) => {
    var json_structure_pt = {
        pt_params: [{
                Name: "step1",
                Desc: "assign radius = 10",
                pre: "",
                //20210521 
                next: ["step2", "step4"],//parallel
                //next: "step2",//sequence
                optimizedRAM: 1024,
                lambdaARN: "arn:aws:lambda:eu-north-1::function:mldo-tcc-step1", //pt
                payload: { radius: 10 }, //pt
                powerValues: [1024, 1792], //pt
                num: 5, //pt, minimum 5
                parallelInvocation: true, //pt
                strategy: "balanced" //pt default "cost"
            },
            {
                Name: "step2",
                Desc: "get radius from caller(previous lambda function), calculate area = radius*radius*Math.PI",
                pre: "step1",
                next: "step3",
                optimizedRAM: 128,
                lambdaARN: "arn:aws:lambda:eu-north-1::function:mldo-tcc-step2", //pt
                payload: { radius: 10 }, //pt
                powerValues: [128,256], //pt
                num: 5, //pt
                parallelInvocation: true, //pt
                strategy: "balanced" //pt default "cost"
            },
            {
                Name: "step3",
                Desc: "get radius from caller(previous lambda function),calculate volume = 4/3*Math.PI*radius*radius*radius",
                pre: "step2",
                //20210521 
                next: "",//parallel
                //next: "step4",//sequence
                optimizedRAM: 128,
                lambdaARN: "arn:aws:lambda:eu-north-1::function:mldo-tcc-step3", //pt
                payload: { radius: 10 }, //pt
                powerValues: [128,256], //pt
                num: 5, //pt
                parallelInvocation: true, //pt
                strategy: "balanced" //pt default "cost"
            },
            {
                Name: "step4",
                Desc: "copy radius = 10",
                //20210521 
                pre: "step1", //parallel
                //pre: "step3", //sequence
                next: "",
                optimizedRAM: 128,
                lambdaARN: "arn:aws:lambda:eu-north-1::function:mldo-tcc-step4", //pt
                payload: { radius: 10 }, //pt
                powerValues: [128,256], //pt
                num: 5, //pt, minimum 5
                parallelInvocation: true, //pt
                strategy: "balanced" //pt default "cost"
            }
        ]
    };
    const response = {
        statusCode: 200,
        //payload: JSON.stringify(json_structure_pt.pt_params[0]),
        payload: JSON.stringify(json_structure_pt)
    };

    return json_structure_pt;
};

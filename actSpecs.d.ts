export declare const actSpecs: {
    etc: {
        button: [string, {
            selector: [false, "string", "hasLength", string];
            which: [false, "string", "hasLength", string];
            index: [false, "number", "", string];
            what: [false, "string", "hasLength", string];
        }];
        checkpoint: [string, {
            which: [true, "string", "hasLength", string];
            what: [false, "string", "hasLength", string];
        }];
        checkbox: [string, {
            selector: [false, "string", "hasLength", string];
            which: [false, "string", "hasLength", string];
            index: [false, "number", "", string];
            what: [false, "string", "hasLength", string];
        }];
        focus: [string, {
            what: [true, "string", "isFocusable", string];
            index: [false, "number", "", string];
            which: [false, "string", "hasLength", string];
        }];
        launch: [string, {
            target: [false, "object", "", string];
            browserID: [false, "string", "isBrowserID", string];
            shoot: [false, "object", "", string];
            what: [false, "string", "hasLength", string];
        }];
        link: [string, {
            selector: [false, "string", "hasLength", string];
            which: [false, "string", "hasLength", string];
            index: [false, "number", "", string];
            what: [false, "string", "hasLength", string];
        }];
        next: [string, {
            if: [true, "array", "", string];
            jump: [false, "number", "", string];
            next: [false, "string", "hasLength", string];
            what: [false, "string", "hasLength", string];
        }];
        page: [string, {
            what: [false, "string", "hasLength", string];
        }];
        press: [string, {
            which: [true, "string", "hasLength", string];
            what: [false, "string", "hasLength", string];
            again: [false, "number", "", string];
        }];
        presses: [string, {
            navKey: [true, "string", "hasLength", string];
            what: [false, "string", "hasLength", string];
            which: [false, "array", "areStrings", string];
            text: [false, "string", "hasLength", string];
            action: [false, "string", "hasLength", string];
            withItems: [true, "boolean", "", string];
        }];
        radio: [string, {
            selector: [false, "string", "hasLength", string];
            which: [false, "string", "hasLength", string];
            index: [false, "number", "", string];
            what: [false, "string", "hasLength", string];
        }];
        reveal: [string, {
            what: [false, "string", "hasLength", string];
        }];
        search: [string, {
            selector: [false, "string", "hasLength", string];
            which: [false, "string", "hasLength", string];
            index: [false, "number", "", string];
            what: [true, "string", "hasLength", string];
        }];
        select: [string, {
            selector: [false, "string", "hasLength", string];
            which: [false, "string", "hasLength", string];
            index: [false, "number", "", string];
            what: [true, "string", "hasLength", string];
        }];
        shoot: [string, {
            exclusionSelector: [false, "string", "hasLength", string];
            colorType: [false, "number", "", string];
            action: [true, "string", "hasLength", string];
            what: [false, "string", "hasLength", string];
        }];
        state: [string, {
            which: [true, "string", "isState", string];
            what: [false, "string", "hasLength", string];
        }];
        test: [string, {
            which: [true, "string", "isTest", string];
            launch: [false, "object", "", string];
            rules: [false, "array", "areStrings", string];
            scope: [false, "string", "isScope", string];
        }];
        text: [string, {
            selector: [false, "string", "hasLength", string];
            which: [false, "string", "hasLength", string];
            index: [false, "number", "", string];
            what: [true, "string", "hasLength", string];
            clear: [false, "boolean", "", string];
        }];
        url: [string, {
            which: [true, "string", "isURL", string];
            what: [false, "string", "hasLength", string];
            id: [false, "string", "hasLength", string];
        }];
        wait: [string, {
            what: [true, "string", "isWaitable", string];
            which: [true, "string", "hasLength", string];
        }];
    };
    tools: {
        axe: [string, {
            detailLevel: [true, "number", "", string];
        }];
        ibm: [string, {
            withItems: [true, "boolean", "", string];
        }];
        nuVal: [string, {
            withSource: [false, "boolean", "", string];
        }];
        nuVnu: [string, {
            withSource: [false, "boolean", "", string];
        }];
        qualWeb: [string, {
            stealth: [false, "boolean", "", string];
            adBlock: [false, "boolean", "", string];
        }];
        testaro: [string, {
            withItems: [true, "boolean", "", string];
            stopOnFail: [true, "boolean", "", string];
            args: [false, "object", "areArrays", string];
            rulesForcedOn: [false, "array", "areStrings", string];
            rulesForcedOff: [false, "array", "areStrings", string];
            retries: [false, "number", "", string];
        }];
        wave: [string, {
            reportType: [true, "number", "", string];
            url: [false, "string", "isURL", string];
            prescript: [false, "string", "", string];
            postscript: [false, "string", "", string];
        }];
    };
};

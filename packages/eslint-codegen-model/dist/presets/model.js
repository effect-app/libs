"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.model = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const generator_1 = __importDefault(require("@babel/generator"));
const parser_1 = require("@babel/parser");
const fs = __importStar(require("fs"));
function normalise(str) {
    try {
        return (0, generator_1.default)((0, parser_1.parse)(str, { sourceType: "module", plugins: ["typescript"] }))
            .code;
        // .replace(/'/g, `"`)
        // .replace(/\/index/g, "")
        // .replace(/([\n\s]+ \|)/g, " |").replaceAll(": |", ":")
        // .replaceAll(/[\s\n]+\|/g, " |")
        // .replaceAll("\n", ";")
        // .replaceAll(" ", "")
        // TODO: remove all \n and whitespace?
    }
    catch (e) {
        return str;
    }
}
const model = ({ meta }) => {
    try {
        const targetContent = fs.readFileSync(meta.filename).toString();
        const processed = [];
        const sourcePath = meta.filename;
        if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
            throw Error(`Source path is not a file: ${sourcePath}`);
        }
        const clss = targetContent.matchAll(/(.*)export class (\w+)[^{]*(Extended(Tagged)?Class)|ExtendedTaggedRequest/g);
        const them = [];
        for (const cls of clss) {
            let modelName = null;
            if (cls && !cls[1] && cls[2]) {
                modelName = cls[2];
            }
            else
                continue;
            if (processed.includes(modelName))
                continue;
            processed.push(modelName);
            them.push([
                `export namespace ${modelName} {`,
                `  export interface Encoded extends S.Struct.Encoded<typeof ${modelName}["fields"]> {}`,
                "}"
            ]);
        }
        const expectedContent = [
            "//",
            `/* eslint-disable */`,
            ...them.flat().filter((x) => !!x),
            `/* eslint-enable */`,
            "//"
        ]
            .join("\n");
        // do not re-emit in a different style, or a loop will occur
        if (normalise(meta.existingContent) === normalise(expectedContent)) {
            return meta.existingContent;
        }
        return expectedContent;
    }
    catch (e) {
        return ("/** Got exception: "
            + ("stack" in e ? e.stack : "")
            + JSON.stringify(e)
            + "*/");
    }
};
exports.model = model;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9tb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1REFBdUQ7QUFDdkQsaUVBQXVDO0FBQ3ZDLDBDQUFxQztBQUVyQyxNQUFZLEVBQUUsK0JBQVU7QUFFeEIsU0FBUyxTQUFTLENBQUMsR0FBVztJQUM1QixJQUFJLENBQUM7UUFDSCxPQUFPLElBQUEsbUJBQVEsRUFDYixJQUFBLGNBQUssRUFBQyxHQUFHLEVBQUUsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQVEsQ0FDckU7YUFDRSxJQUFJLENBQUE7UUFDUCxzQkFBc0I7UUFDdEIsMkJBQTJCO1FBQzNCLHlEQUF5RDtRQUN6RCxrQ0FBa0M7UUFDbEMseUJBQXlCO1FBQ3pCLHVCQUF1QjtRQUN2QixzQ0FBc0M7SUFDeEMsQ0FBQztJQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDWCxPQUFPLEdBQUcsQ0FBQTtJQUNaLENBQUM7QUFDSCxDQUFDO0FBRU0sTUFBTSxLQUFLLEdBRWIsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUU7SUFDaEIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxhQUFhLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUE7UUFFL0QsTUFBTSxTQUFTLEdBQWEsRUFBRSxDQUFBO1FBRTlCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUE7UUFDaEMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDcEUsTUFBTSxLQUFLLENBQUMsOEJBQThCLFVBQVUsRUFBRSxDQUFDLENBQUE7UUFDekQsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsNEVBQTRFLENBQUMsQ0FBQTtRQUNqSCxNQUFNLElBQUksR0FBRyxFQUFFLENBQUE7UUFDZixLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ3ZCLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQTtZQUNwQixJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDN0IsU0FBUyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUNwQixDQUFDOztnQkFBTSxTQUFRO1lBQ2YsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztnQkFBRSxTQUFRO1lBQzNDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUE7WUFFekIsSUFBSSxDQUFDLElBQUksQ0FBQztnQkFDUixvQkFBb0IsU0FBUyxJQUFJO2dCQUNqQyw4REFBOEQsU0FBUyxnQkFBZ0I7Z0JBQ3ZGLEdBQUc7YUFDSixDQUFDLENBQUE7UUFDSixDQUFDO1FBQ0QsTUFBTSxlQUFlLEdBQUc7WUFDdEIsSUFBSTtZQUNKLHNCQUFzQjtZQUN0QixHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUMscUJBQXFCO1lBQ3JCLElBQUk7U0FDTDthQUNFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUViLDREQUE0RDtRQUM1RCxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssU0FBUyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFDbkUsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFBO1FBQzdCLENBQUM7UUFDRCxPQUFPLGVBQWUsQ0FBQTtJQUN4QixDQUFDO0lBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNYLE9BQU8sQ0FDTCxxQkFBcUI7Y0FDbkIsQ0FBQyxPQUFPLElBQUssQ0FBUyxDQUFDLENBQUMsQ0FBRSxDQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Y0FDL0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Y0FDakIsSUFBSSxDQUNQLENBQUE7SUFDSCxDQUFDO0FBQ0gsQ0FBQyxDQUFBO0FBbkRZLFFBQUEsS0FBSyxHQUFMLEtBQUssQ0FtRGpCIn0=
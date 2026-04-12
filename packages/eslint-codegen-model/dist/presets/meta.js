"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meta = void 0;
const filterAdjacent = (input) => input.filter((i, idx) => input[idx - 1] !== i);
/**
 * Adds file meta
 */
const meta = ({ meta, options }) => {
    const sourcePrefix = options.sourcePrefix || "src/";
    const moduleName = filterAdjacent(meta
        .filename
        .substring(meta.filename.indexOf(sourcePrefix) + sourcePrefix.length, meta.filename.length - 3)
        .split("/"))
        .filter((_) => _ !== "resources")
        .join("/");
    const expectedContent = `export const Req = TaggedRequestFor("${moduleName}")`;
    try {
        if (expectedContent === meta.existingContent) {
            return meta.existingContent;
        }
    }
    catch (_a) { }
    return expectedContent;
};
exports.meta = meta;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0YS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9wcmVzZXRzL21ldGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBRUEsTUFBTSxjQUFjLEdBQUcsQ0FBQyxLQUFlLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBO0FBRTFGOztHQUVHO0FBQ0ksTUFBTSxJQUFJLEdBQXNDLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtJQUMzRSxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsWUFBWSxJQUFJLE1BQU0sQ0FBQTtJQUNuRCxNQUFNLFVBQVUsR0FBRyxjQUFjLENBQy9CLElBQUk7U0FDRCxRQUFRO1NBQ1IsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxHQUFHLFlBQVksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1NBQzlGLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FDZDtTQUNFLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLFdBQVcsQ0FBQztTQUNoQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDWixNQUFNLGVBQWUsR0FBRyx3Q0FBd0MsVUFBVSxJQUFJLENBQUE7SUFFOUUsSUFBSSxDQUFDO1FBQ0gsSUFBSSxlQUFlLEtBQUssSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzdDLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQTtRQUM3QixDQUFDO0lBQ0gsQ0FBQztJQUFDLFdBQU0sQ0FBQyxDQUFBLENBQUM7SUFFVixPQUFPLGVBQWUsQ0FBQTtBQUN4QixDQUFDLENBQUE7QUFuQlksUUFBQSxJQUFJLFFBbUJoQiJ9
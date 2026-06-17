/**
 * Native (tsgo-backed) implementation of {@link ModelTypeResolver}.
 *
 * Where {@link createModelTypeResolver} drives the classic `typescript` Compiler
 * API in-process, this resolver shells out to a forked `tsgolint` binary
 * (`model-codegen` subcommand) that runs the type query on `typescript-go`. The
 * binary builds the program once per invocation and answers a batch of model
 * names over a one-shot JSON-on-stdio protocol.
 *
 * Selected via the CLI `--native` flag; the classic resolver remains the default.
 *
 * Vertical slice: only the `Encoded` member is ported. For any option that needs
 * `Type`/`Make`/services/facade the resolver returns `null`, so the caller falls
 * back to leaving the block untouched (same contract as "no resolver").
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";
const require_ = createRequire(import.meta.url);
/**
 * Resolve the forked tsgolint binary (the one that also backs `oxlint
 * --type-aware`). Precedence:
 *   1. `TSGOLINT_CODEGEN_BIN` (explicit override),
 *   2. the `oxlint-tsgolint` package — repo-wide overridden to `repos/tsgolint-fork`
 *      via pnpm, whose shim extracts and returns the platform binary.
 *
 * Using the same package as oxlint guarantees one binary serves both the editor
 * lint path (`headless`) and model codegen (`model-codegen`).
 */
function resolveBinary() {
    const fromEnv = process.env["TSGOLINT_CODEGEN_BIN"];
    if (fromEnv)
        return fromEnv;
    try {
        const shimPath = require_.resolve("oxlint-tsgolint/bin/tsgolint.js");
        const { ensureBinary } = require_(shimPath);
        return ensureBinary();
    }
    catch (e) {
        throw new Error(`native model codegen: could not resolve the tsgolint-fork binary via oxlint-tsgolint (${e.message}). Ensure the pnpm override is installed, or set TSGOLINT_CODEGEN_BIN.`);
    }
}
export function createNativeModelTypeResolver(args) {
    const tsconfig = path.resolve(args.tsconfigPath);
    // Resolve (and, on first use, fetch/extract) the binary lazily — only once a
    // codegen block actually needs the type checker. Creating a resolver for a
    // file that turns out to have no static/facade block costs nothing. Memoized.
    let binary;
    const getBinary = () => { var _a; return (binary !== null && binary !== void 0 ? binary : (binary = (_a = args.binary) !== null && _a !== void 0 ? _a : resolveBinary())); };
    return {
        generate(filename, modelNames, options) {
            var _a, _b, _c, _d;
            const request = JSON.stringify({
                tsconfig,
                fileName: path.resolve(filename),
                models: modelNames,
                options: {
                    type: (_a = options.type) !== null && _a !== void 0 ? _a : false,
                    make: (_b = options.make) !== null && _b !== void 0 ? _b : false,
                    facade: (_c = options.facade) !== null && _c !== void 0 ? _c : false
                }
            });
            let stdout;
            try {
                stdout = execFileSync(getBinary(), ["model-codegen"], {
                    input: request,
                    encoding: "utf8",
                    maxBuffer: 64 * 1024 * 1024
                });
            }
            catch (e) {
                const err = e;
                // The binary still emits a JSON error payload on a non-zero exit.
                stdout = (_d = err.stdout) !== null && _d !== void 0 ? _d : "";
            }
            let parsed;
            try {
                parsed = JSON.parse(stdout);
            }
            catch (_e) {
                return null;
            }
            if (!parsed.ok || !parsed.blocks)
                return null;
            const blocks = [];
            for (const name of modelNames) {
                const block = parsed.blocks[name];
                if (block === undefined)
                    return null;
                blocks.push(block);
            }
            return blocks.join("\n");
        }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlLXR5cGUtcmVzb2x2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2hhcmVkL25hdGl2ZS10eXBlLXJlc29sdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7OztHQWNHO0FBQ0gsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9CQUFvQixDQUFBO0FBQ2pELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxhQUFhLENBQUE7QUFDM0MsT0FBTyxLQUFLLElBQUksTUFBTSxXQUFXLENBQUE7QUFHakMsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBRS9DOzs7Ozs7Ozs7R0FTRztBQUNILFNBQVMsYUFBYTtJQUNwQixNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUE7SUFDbkQsSUFBSSxPQUFPO1FBQUUsT0FBTyxPQUFPLENBQUE7SUFDM0IsSUFBSSxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFBO1FBQ3BFLE1BQU0sRUFBRSxZQUFZLEVBQUUsR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFtQyxDQUFBO1FBQzdFLE9BQU8sWUFBWSxFQUFFLENBQUE7SUFDdkIsQ0FBQztJQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDWCxNQUFNLElBQUksS0FBSyxDQUNiLHlGQUNHLENBQVcsQ0FBQyxPQUNmLHdFQUF3RSxDQUN6RSxDQUFBO0lBQ0gsQ0FBQztBQUNILENBQUM7QUFRRCxNQUFNLFVBQVUsNkJBQTZCLENBQUMsSUFHN0M7SUFDQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQTtJQUVoRCw2RUFBNkU7SUFDN0UsMkVBQTJFO0lBQzNFLDhFQUE4RTtJQUM5RSxJQUFJLE1BQTBCLENBQUE7SUFDOUIsTUFBTSxTQUFTLEdBQUcsR0FBRyxFQUFFLGtCQUFDLENBQUMsTUFBTSxhQUFOLE1BQU0sY0FBTixNQUFNLElBQU4sTUFBTSxTQUFLLElBQUksQ0FBQyxNQUFNLG1DQUFJLGFBQWEsRUFBRSxFQUFDLEdBQUEsQ0FBQTtJQUVuRSxPQUFPO1FBQ0wsUUFBUSxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsT0FBdUI7O1lBQ3BELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQzdCLFFBQVE7Z0JBQ1IsUUFBUSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDO2dCQUNoQyxNQUFNLEVBQUUsVUFBVTtnQkFDbEIsT0FBTyxFQUFFO29CQUNQLElBQUksUUFBRSxPQUFPLENBQUMsSUFBSSxtQ0FBSSxLQUFLO29CQUMzQixJQUFJLFFBQUUsT0FBTyxDQUFDLElBQUksbUNBQUksS0FBSztvQkFDM0IsTUFBTSxRQUFFLE9BQU8sQ0FBQyxNQUFNLG1DQUFJLEtBQUs7aUJBQ2hDO2FBQ0YsQ0FBQyxDQUFBO1lBRUYsSUFBSSxNQUFjLENBQUE7WUFDbEIsSUFBSSxDQUFDO2dCQUNILE1BQU0sR0FBRyxZQUFZLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxlQUFlLENBQUMsRUFBRTtvQkFDcEQsS0FBSyxFQUFFLE9BQU87b0JBQ2QsUUFBUSxFQUFFLE1BQU07b0JBQ2hCLFNBQVMsRUFBRSxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUk7aUJBQzVCLENBQUMsQ0FBQTtZQUNKLENBQUM7WUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNYLE1BQU0sR0FBRyxHQUFHLENBQXdCLENBQUE7Z0JBQ3BDLGtFQUFrRTtnQkFDbEUsTUFBTSxTQUFHLEdBQUcsQ0FBQyxNQUFNLG1DQUFJLEVBQUUsQ0FBQTtZQUMzQixDQUFDO1lBRUQsSUFBSSxNQUFzQixDQUFBO1lBQzFCLElBQUksQ0FBQztnQkFDSCxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQW1CLENBQUE7WUFDL0MsQ0FBQzt1QkFBTyxDQUFDO2dCQUNQLE9BQU8sSUFBSSxDQUFBO1lBQ2IsQ0FBQztZQUNELElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU07Z0JBQUUsT0FBTyxJQUFJLENBQUE7WUFFN0MsTUFBTSxNQUFNLEdBQWtCLEVBQUUsQ0FBQTtZQUNoQyxLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUM5QixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFBO2dCQUNqQyxJQUFJLEtBQUssS0FBSyxTQUFTO29CQUFFLE9BQU8sSUFBSSxDQUFBO2dCQUNwQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBQ3BCLENBQUM7WUFDRCxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDMUIsQ0FBQztLQUNGLENBQUE7QUFDSCxDQUFDIn0=
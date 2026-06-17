export type ModelFacadeOptions = {
    readonly className?: string;
    readonly name?: string;
    readonly schema?: string;
    /**
     * Base mode: emit a non-exported base `class __X extends OpaqueFacadeClass<...>()(_X) {}`
     * instead of `export class X`. The user owns `export class X extends __X { ...statics... }`,
     * so static/instance members live on the public class while `_X` stays a light schema.
     */
    readonly base?: boolean;
};
export declare function modelFacade({ meta, options }: {
    meta?: {
        existingContent: string;
    };
    options: ModelFacadeOptions;
}): string;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwtZmFjYWRlLmQudHMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcHJlc2V0cy9tb2RlbC1mYWNhZGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTSxNQUFNLGtCQUFrQixHQUFHO0lBQy9CLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxNQUFNLENBQUE7SUFDM0IsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sQ0FBQTtJQUN0QixRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsTUFBTSxDQUFBO0lBQ3hCOzs7O09BSUc7SUFDSCxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxDQUFBO0NBQ3hCLENBQUE7QUFRRCx3QkFBZ0IsV0FBVyxDQUN6QixFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsRUFBRTtJQUFFLElBQUksQ0FBQyxFQUFFO1FBQUUsZUFBZSxFQUFFLE1BQU0sQ0FBQTtLQUFFLENBQUM7SUFBQyxPQUFPLEVBQUUsa0JBQWtCLENBQUE7Q0FBRSxHQUNyRixNQUFNLENBMkJSIn0=
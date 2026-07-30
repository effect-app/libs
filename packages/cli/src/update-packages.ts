export const makeNcuUpdateCommand = (
  filter: string,
  options?: { readonly recursive?: boolean }
) => `pnpm ${options?.recursive ? "-r " : ""}exec ncu -u --target semver --filter "${filter}"`

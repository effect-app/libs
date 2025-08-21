{
  description = "Node 22 + pnpm 10 dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodejs = pkgs.nodejs_24;
        pnpm = pkgs.pnpm.override { inherit nodejs; };
        tools = with pkgs; [
          git
          nixfmt-classic
          nodejs
          pnpm
          typescript
        ];
      in {
        devShells.default = pkgs.mkShellNoCC {
          packages = tools;
        };
      });
}

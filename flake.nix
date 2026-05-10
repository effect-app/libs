{
  description = "Node 24 + pnpm 11 dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodejs = pkgs.nodejs_24;
        pnpm = (pkgs.pnpm.override { inherit nodejs; }).overrideAttrs (old: rec {
          version = "11.0.9";
          src = pkgs.fetchurl {
            url = "https://registry.npmjs.org/pnpm/-/pnpm-${version}.tgz";
            hash = "sha256-TYTXsOMckFT2Flh5VpgHAAfQO3I4SB4hYaViVXqpCDQ=";
          };
        });
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

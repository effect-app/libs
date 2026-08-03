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
        # nixpkgs does not ship pnpm 11 yet; package the npm release the same way
        # pkgs.pnpm does for older majors so the shell matches packageManager.
        pnpm = pkgs.callPackage
          "${pkgs.path}/pkgs/development/tools/pnpm/generic.nix"
          {
            inherit nodejs;
            version = "11.18.0";
            hash = "sha256-KcNcqNKih5iP3uPg824H2bk3g/VntXm3/Vt5ikVj3YE=";
          };
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

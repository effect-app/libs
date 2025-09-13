# Specifies which operating system image to use.
FROM mcr.microsoft.com/vscode/devcontainers/base:ubuntu

WORKDIR /home/vscode

# curl and ca-certificates are needed for volta installation
RUN apt-get update \
  && apt-get install -y \
  curl \
  ca-certificates \
  --no-install-recommends

# Changes user to vscode and the SHELL to bash
USER vscode
SHELL ["/bin/bash", "-c"]

# since we're starting non-interactive shell, we wil need to tell bash to load .bashrc manually
ENV BASH_ENV ~/.bashrc
# needed by volta() function
ENV VOLTA_HOME /home/vscode/.volta
# make sure packages managed by volta will be in PATH
ENV PATH $VOLTA_HOME/bin:$PATH

# download volta
RUN curl https://get.volta.sh | bash
# change the working directory to the one where the project lives
WORKDIR /workspaces/macs-configurator

# and install node and pnpm
RUN volta install node@24
RUN npm i -g pnpm

RUN echo 

ENV SHELL=/bin/bash

RUN echo 

# prevent `npm or yarn` usage in the shell now that pnpm is installed
WORKDIR /home/vscode
COPY usepnpm.sh /tmp/
RUN cat /tmp/usepnpm.sh >> ~/.bashrc

FROM oven/bun:1.0.18-debian as base
WORKDIR /app/prasi

RUN apt-get update
RUN apt-get install unzip

COPY pkgs/docker-prep.ts .
RUN bun docker-prep.ts
WORKDIR /app/prasi/_tmp_docker
RUN bun install
COPY _tmp_docker/node_modules .
WORKDIR /app/prasi
RUN rm -rf _tmp_docker
COPY . .

EXPOSE 3000/tcp
CMD [ "bun", "run", "prod" ]

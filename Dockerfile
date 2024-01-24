FROM oven/bun:1.0.18-debian as base
WORKDIR /app/prasi
COPY . . 

RUN apt-get update
RUN apt-get install unzip
RUN bun install
EXPOSE 3000/tcp
CMD [ "bun", "run", "prod" ]
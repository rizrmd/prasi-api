FROM oven/bun:1.0.18-debian as base
WORKDIR /app/prasi

RUN apt-get update
RUN apt-get install unzip zip


COPY dockerzip .
RUN unzip -o dockerzip
RUN bun install
COPY . .

EXPOSE 3000/tcp
CMD [ "bun", "run", "prod" ]

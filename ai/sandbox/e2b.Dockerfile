FROM e2bdev/code-interpreter:latest

USER root

# Install C++, Java, and Go compilers and toolchains
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    clang-tidy \
    cmake \
    default-jdk-headless \
    maven \
    golang-go \
    && rm -rf /var/lib/apt/lists/*

# Install Python & TypeScript tooling
RUN pip install --no-cache-dir \
    pytest==8.3.5 \
    ruff==0.11.0 \
    && npm install -g typescript@5.8.2

USER user

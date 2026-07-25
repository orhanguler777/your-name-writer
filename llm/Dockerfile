FROM nvidia/cuda:12.2-runtime-ubuntu22.04

# Install basic utilities
RUN apt-get update && apt-get install -y python3 python3-pip git curl && \
    rm -rf /var/lib/apt/lists/*

# Install Ollama (LLM runtime)
RUN curl -sSL https://ollama.com/install.sh | sh

# Pull the int8‑quantized LLaVA‑7B model (runs on 24 GB VRAM)
RUN ollama pull llava-7b-int8

EXPOSE 11434

CMD ["ollama", "serve"]

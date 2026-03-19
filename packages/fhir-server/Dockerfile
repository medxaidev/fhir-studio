# Railway Dockerfile for fhir-server
# Uses Node.js 20 and tsx to run TypeScript directly

FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (use npm install since this is a monorepo package without its own lock file)
RUN npm install --production=false

# Copy all source files
COPY . .

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Start command using tsx to run TypeScript directly
CMD ["npm", "run", "start:prod"]

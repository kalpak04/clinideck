FROM node:22-slim
WORKDIR /app

# Copy package descriptors and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Build the client frontend distribution
RUN npm run build

# Default production environment
ENV NODE_ENV=production
EXPOSE 3000

# Start Express server serving production assets & API routes
CMD ["npm", "start"]

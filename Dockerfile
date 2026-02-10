FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create volume mount point for database
VOLUME ["/app/data"]

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV DB_PATH=/app/data/kanban.db
ENV PORT=3000

# Run the app
CMD ["node", "server.js"]

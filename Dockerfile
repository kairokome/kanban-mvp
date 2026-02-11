FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Inject version info into HTML at build time
ARG COMMIT_HASH=local
ARG DEPLOY_TIME
ENV COMMIT_HASH=$COMMIT_HASH
ENV DEPLOY_TIME=$DEPLOY_TIME
RUN if [ -n "$DEPLOY_TIME" ]; then sed -i "s|data-commit=\"[^\"]*\"|data-commit=\"${COMMIT_HASH}\"|" public/index.html && sed -i "s|data-deploy-time=\"[^\"]*\"|data-deploy-time=\"${DEPLOY_TIME}\"|" public/index.html; fi

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

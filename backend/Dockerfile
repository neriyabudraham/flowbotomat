FROM node:20-alpine

WORKDIR /app

# Install PostgreSQL client for pg_dump backups
RUN apk add --no-cache postgresql-client

# Install nodemon globally
RUN npm install -g nodemon

# Install dependencies
COPY package*.json ./
RUN npm install && npm install googleapis

# Copy source code
COPY . .

# Expose port
EXPOSE 4000

# Start command
CMD ["npm", "run", "dev"]

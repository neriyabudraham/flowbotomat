FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for environment variables
ARG VITE_API_URL
ARG VITE_SUMIT_PUBLIC_KEY

# Set environment variables for build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUMIT_PUBLIC_KEY=$VITE_SUMIT_PUBLIC_KEY

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# Dockerfile
# Development stage
FROM nginx:alpine AS development

# Install curl for health checks (optional for dev)
RUN apk add --no-cache curl

# Copy configuration files
COPY nginx-dev.conf /etc/nginx/nginx.conf

# Copy application files
COPY src/index.html /usr/share/nginx/html/
COPY src/styles.css /usr/share/nginx/html/
COPY src/data-builder.js /usr/share/nginx/html/
COPY data/schema.json /usr/share/nginx/html/

# Expose port 8080 for development
EXPOSE 8080

# Health check for development
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

# Default command (can be overridden)
CMD ["nginx", "-g", "daemon off;"]

# Production stage
FROM nginx:alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Copy configuration files
COPY nginx-prod.conf /etc/nginx/nginx.conf

# Copy application files from development stage
COPY --from=development /usr/share/nginx/html/ /usr/share/nginx/html/

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /var/log/nginx && \
    chown -R appuser:appgroup /etc/nginx/conf.d && \
    chmod -R 755 /usr/share/nginx/html

# Switch to non-root user
USER appuser

# Expose port 8080 for production
EXPOSE 8080

# Health check for production
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

# Command to run NGINX
CMD ["nginx", "-g", "daemon off;"]
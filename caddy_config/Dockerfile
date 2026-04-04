FROM caddy:2.8-alpine

# Install iproute2 to have the `tc` command (traffic control / netem)
# Backend will call `docker exec caddy_server tc ...` to simulate ACTUAL network conditions
# tc runs on this container because Caddy serves media directly to the browser
RUN apk add --no-cache iproute2

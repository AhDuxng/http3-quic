FROM caddy:2.8-alpine

# Cai iproute2 de co lenh `tc` (traffic control / netem)
# Backend se goi `docker exec caddy_server tc ...` de gia lap dieu kien mang THUC TE
# Tc chay tren container nay vi Caddy la noi phuc vu media truc tiep cho browser
RUN apk add --no-cache iproute2

#include <node_api.h>
#include <stdint.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <linux/tcp.h>

static napi_value sample(napi_env env, napi_callback_info callback_info) {
    size_t argc = 1;
    napi_value argv[1], result, value;
    int32_t fd;
    struct tcp_info info = {0};
    socklen_t length = sizeof(info);

    if (napi_get_cb_info(env, callback_info, &argc, argv, NULL, NULL) != napi_ok ||
        argc != 1 || napi_get_value_int32(env, argv[0], &fd) != napi_ok || fd < 0 ||
        getsockopt(fd, IPPROTO_TCP, TCP_INFO, &info, &length) != 0) {
        napi_get_null(env, &result);
        return result;
    }

    napi_create_object(env, &result);
#define SET_NUMBER(name, number) do { \
    napi_create_double(env, (double)(number), &value); \
    napi_set_named_property(env, result, name, value); \
} while (0)
    SET_NUMBER("cwnd_bytes", (uint64_t)info.tcpi_snd_cwnd * info.tcpi_snd_mss);
    SET_NUMBER("cwnd_segments", info.tcpi_snd_cwnd);
    SET_NUMBER("snd_mss_bytes", info.tcpi_snd_mss);
    SET_NUMBER("rtt_ms", (double)info.tcpi_rtt / 1000.0);
    SET_NUMBER("retransmissions", info.tcpi_total_retrans);
#undef SET_NUMBER
    return result;
}

static napi_value init(napi_env env, napi_value exports) {
    napi_value function;
    napi_create_function(env, "sample", NAPI_AUTO_LENGTH, sample, NULL, &function);
    napi_set_named_property(env, exports, "sample", function);
    return exports;
}

NAPI_MODULE(tcp_info, init)

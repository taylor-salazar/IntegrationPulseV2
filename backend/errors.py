"""Safe, typed errors at the proxy's external boundaries."""


class InvalidRuntimeEndpoint(ValueError):
    pass


class InvalidUpstreamResponse(RuntimeError):
    pass

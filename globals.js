module.exports.response_message = {
    info: {
        api_name: "Printer Info Snatcher",
        version: process.env.VER,
        description: "Gets printer info from IP address",
        supported_printers: "HP Enterprise M-series",
        request_format: "http://app-ip-address?ip=w.x.y.z",
        response_type: "json",
    }
};
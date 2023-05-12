const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const pupp = require("puppeteer");
const {isIPV4Address} = require("ip-address-validator");
const cors = require('cors');
const {response} = require("express");
const isReachable = require('is-reachable');
require("dotenv").config();

const app = express();

app.use(helmet());
app.use(morgan('tiny'));
app.use(cors());

// for storing references to objects
let system = {
    browser : null,
    printer : null
};


let response_message = {
    info: {
        api_name: "Printer Info Snatcher",
        version: process.env.VER,
        description: "Returns printer info from IP address",
        supported_printers: "HP Enterprise M-series",
        request_format: "http://app-ip-address?ip=w.x.y.z",
        response_type: "json",
    }
};

let request_message = {};
let printer_message = {}; // hello world
let host;

let browser_params = {
    waitUntil: 'networkidle0',
    timeout: 5000
};

async function open_browser(){
    system.browser = await pupp.launch({
        headless: true,
        devtools: false,
        ignoreHTTPSErrors: true,
        args: ['--incognito', '--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox']
    });
}

async function get_device_details(printer_obj){

    return new Promise((resolve, reject) => {

        const page = system.browser.newPage();
        page.goto(`https://${printer_obj.host}/hp/device/DeviceInformation/View`, browser_params);

        printer_obj.model = page.evaluate(()=> {
            return document.querySelector("#ProductName").textContent;
        })
        printer_obj.name = page.evaluate(()=> {
            return document.querySelector("#DeviceName").textContent;
        });
        printer_obj.serial = page.evaluate(()=> {
            return document.querySelector("#DeviceSerialNumber").textContent;
        });
        printer_obj.location = page.evaluate(()=> {
            return document.querySelector("#DeviceLocation").textContent;
        });

        resolve("1");

    });

}

async function get_supply_details(printer_obj){

    return new Promise((resolve, reject) => {

        const page = system.browser.newPage();
        page.goto(`https://${printer_obj.host}/hp/device/DeviceStatus/Index`, browser_params);

        let cartridges = page.evaluate(() => {
            return Array.from(document.querySelectorAll(".cartridges .consumable h2"))
                .map (x=> x.textContent);
        });

        let levels = page.evaluate(() => {
            return Array.from(document.querySelectorAll(".cartridges .consumable .plr"))
                .map (x=> x.textContent.replace("%*", ''));
        });

        for(let i = 0; i < cartridges.length; ++i) {
            printer_obj.supplies[cartridges[i]] = levels[i];
        }
        resolve("1");
    });

}

async function get_tray_details(printer_obj){

    return new Promise((resolve, reject) => {

        const page = system.browser.newPage();
        page.goto(`https://${printer_obj.host}/hp/device/DeviceStatus/Index`, browser_params);

        async function get_tray_info(tray_no) {
            return {
                status: (await page.evaluate((tray_no) => {
                    return document.querySelector(`#TrayBinStatus_${tray_no}`).textContent;
                }, tray_no)).replace('%', ''),
                capacity: await page.evaluate((tray_no) => {
                    return document.querySelector(`#TrayBinCapacity_${tray_no}`).textContent;
                }, tray_no),
                size: (await page.evaluate((tray_no) => {
                    return document.querySelector(`#TrayBinSize_${tray_no}`).textContent;
                }, tray_no)).replace("▭", '').trim(),
                type: await page.evaluate((tray_no) => {
                    return document.querySelector(`#TrayBinType_${tray_no}`).textContent;
                }, tray_no)
            };
        }
        async function tray_exists(tray_no) {
            let div = await page.evaluate((tray_no) => {
                return document.querySelector(`#TrayBin_Tray${tray_no}`);
            }, tray_no);
            return div != null;
        }

        if((page.$("#TrayBin_MultipurposeTray"))) {
            printer_obj.trays["Tray 1"] = get_tray_info(1);
        }

        let tray = 2;
        while(tray_exists(tray)) {
            printer_obj.trays[`Tray ${tray}`] = get_tray_info(tray);
            ++tray;
        }

        let machine_status_array = page.evaluate(() => {
            return Array.from(document.querySelectorAll("#MachineStatus"))
                .map(x=> x.textContent.trim())
        });

        printer_obj.errors = machine_status_array.filter(msg => msg !== "Ready");
        resolve("1");
    });

}

// async function handle_error(result){
//
//     return new Promise((resolve, reject) => {});
//
//     let [device_details, supply_details, tray_details] = result;
//
//     if (device_details.status === "rejected")
//         return "Cannot get device details";
//     else if (supply_details.status === "rejected")
//         return "Cannot get supplies";
//     else if (tray_details.status === "rejected")
//         return "Cannot get Tray data";
//     else
//         return "Internal server error";
// }


class Printer {
    constructor(host) {
        this.host = host;
        this.name = null;
        this.type = null;
        this.model = null;
        this.serial = null;
        this.location = null;
        this.trays = {};
        this.supplies = {};
        this.errors = null;
    }

    async get_info() {
        // See if printer is online, if not return an error
        if (!await isReachable(this.host)) {
            printer_message = {
                status: "error",
                message: "IP address unreachable"
            };
        }

        else {
            let [device_details,
                supply_details,
                tray_details]
                = await Promise.allSettled([
                get_device_details(this),
                get_supply_details(this),
                get_tray_details(this),
                ]
            );

            console.log(get_device_details(this));

            if (await device_details.status === "rejected" ||
                await supply_details.status === "rejected" ||
                await tray_details.status === "rejected"    )
            {
                printer_message = {
                    status: "error",

                };
            }

            else {
                this.type = await this.model.includes("Color") ? "color" : "grayscale";
                printer_message = {
                    status: "success",
                    message: this
                };
                request_message.ip = this.host;
            }
        }
    }
}

app.get('/', async (req, res) =>
{
    let ip = req.query.ip;
    if (ip === undefined)
        res.status(200).json(response_message);

    else
    {
        if (isIPV4Address(ip.trim()))
        {
            let printer = new Printer(ip.trim());
            await printer.get_info();
            response_message.response = printer_message;
            response_message.request = request_message;

            res.status(200).json(response_message);

        }
        else {
            response_message.response = {
                status: "error",
                message: "Invalid IPV4 Address"
            }
            res.status(400).json(response_message);
            await system.browser.close();
        }
    }

});

let port = process.env.PORT || 8000;
app.listen(port, () => {
    console.log(`listening on port http://localhost:${port}`);
});
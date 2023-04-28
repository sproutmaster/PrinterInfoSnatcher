const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const pupp = require("puppeteer");
const {isIPV4Address} = require("ip-address-validator");
require("dotenv").config();
const cors = require('cors');
const {response} = require("express");

const app = express();

app.use(helmet());
app.use(morgan('tiny'));
app.use(cors());

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

let request_message = {}
let printer_message = {}; // hello world

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

    async get_info()
    {
        const browser = await pupp.launch({
            headless: true,
            devtools: false,
            ignoreHTTPSErrors: true,
            args: ['--incognito', '--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox']
        });

        let browser_params = {
            waitUntil: 'networkidle0',
            timeout: 5000
        }

        const page = await browser.newPage();

        // See if printer is online

        try {
            await page.goto(`https://${this.host}/hp/device/DeviceInformation/View`, browser_params);
        }
        catch (err) {
            await browser.close();
            printer_message = {
                status: "error",
                message: "Incompatible printer or ip address unreachable"
            }
            return 1;
        }

        // Get device details

        try {
            this.model = await page.evaluate(()=> {
                return document.querySelector("#ProductName").textContent;
            })
            this.name = await page.evaluate(()=> {
                return document.querySelector("#DeviceName").textContent;
            });
            this.serial = await page.evaluate(()=> {
                return document.querySelector("#DeviceSerialNumber").textContent;
            });
            this.location = await page.evaluate(()=> {
                return document.querySelector("#DeviceLocation").textContent;
            });

        }
        catch (err) {
            await browser.close();
            printer_message = {
                status: "error",
                message: "Internal server error - printer may not be supported or taking too long to respond"
            }
            return 1;
        }

        // Getting supply details

        try {
            await page.goto(`https://${this.host}/hp/device/DeviceStatus/Index`, browser_params);

            let cartridges = await page.evaluate(() => {
                return Array.from(document.querySelectorAll(".cartridges .consumable h2"))
                    .map (x=> x.textContent);
            });

            let levels = await page.evaluate(() => {
                return Array.from(document.querySelectorAll(".cartridges .consumable .plr"))
                    .map (x=> x.textContent.replace("%*", ''));
            });

            for(let i = 0; i < cartridges.length; ++i) {
                this.supplies[cartridges[i]] = levels[i];
            }

            async function get_tray_info(tray_no) {
                return {
                    status : (await page.evaluate((tray_no) => {
                        return document.querySelector(`#TrayBinStatus_${tray_no}`).textContent;
                    }, tray_no)).replace('%', ''),
                    capacity : await page.evaluate((tray_no)=> {
                        return document.querySelector(`#TrayBinCapacity_${tray_no}`).textContent;
                    }, tray_no),
                    size : (await page.evaluate((tray_no) => {
                        return document.querySelector(`#TrayBinSize_${tray_no}`).textContent;
                    }, tray_no)).replace("▭", '').trim(),
                    type : await page.evaluate((tray_no)=> {
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

            if((await page.$("#TrayBin_MultipurposeTray"))) {
                this.trays["Tray 1"] = await get_tray_info(1);
            }

            let tray = 2;
            while(await tray_exists(tray)) {
                this.trays[`Tray ${tray}`] = await get_tray_info(tray);
                ++tray;
            }

            let machine_status_array = await page.evaluate(() => {
                return Array.from(document.querySelectorAll("#MachineStatus"))
                    .map(x=> x.textContent.trim())
            });

            this.errors = machine_status_array.filter(msg => msg !== "Ready");

        }
        catch (err) {
            await browser.close();
            printer_message = {
                status: "error",
                message: "Internal server error - unable to read tray/cartridge data"
            }
            return 1;
        }

        this.type = await this.model.includes("Color") ? "color" : "grayscale";

        printer_message = {
            status: "success",
            message: this
        }

        request_message.ip = this.host;
        await browser.close();
    }
}


app.get('/', async (req, res) =>
{
    let ip = req.query.ip;
    if (ip === undefined) {
        res.status(200).json(response_message);
    }
    else {
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
        }
    }

});

let port = process.env.PORT || 8000;
app.listen(port, () => {
    console.log(`listening on port http://localhost:${port}`);
});
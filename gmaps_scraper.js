const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");
const events = require("events");
const { Keyboard } = require("./keyboard.js");
const emails = require("./emails.js");

const idsFileName = "aa_id.json";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getIDS(path)
{
    try
    {
        const data = fs.readFileSync(path, {
            encoding: "utf8", flag: "r"
        });
        return JSON.parse(data);
    }
    catch
    {
        fs.writeFileSync(path, "[]", {
            encoding: "utf8"
        });
        return [];
    }
}

class GMapsScraper {

    #client;
    /* ID de la ultima peticion a /.../place */
    #place_request_id;
    #config;
    #domScript;
    #eventManager;
    #idsFile;

    constructor(cfg)
    {
        this.#config = {
            data_folder: "./data/"
        };

        if (cfg)
            for (const key in cfg)
                this.#config[key] = cfg[key];

        if (!fs.existsSync(this.#config.data_folder))
            fs.mkdir(this.#config.data_folder, {
                recursive: true
            }, err => {
                if (err)
                    throw new Error(err);
            });
        
        this.#idsFile = getIDS(path.join(this.#config.data_folder, idsFileName));
        
        this.#eventManager = new events.EventEmitter();
    }

    async #getDOMScript()
    {
        if (this.#domScript)
            return Promise.resolve(this.#domScript);

        return new Promise((resolve, reject) => {
            fs.readFile("./dom_script.js", null, (err, data) => {
                if (err)
                    return reject(err);

                const script = data.toString();
                this.#domScript = script;
                resolve(script);
            });
        });
    }

    async #scrollPlaceList()
    {
        await this.#executeScript(`scrollPlaceList();`);
        return Promise.resolve();
    }

    async #craftScript(code)
    {
        const baseScript = await this.#getDOMScript();
        const script = baseScript.replace("/* CODE_REPLACE */", code);
        return script;
    }

    async #executeScript(expr)
    {
        const script = await this.#craftScript(expr);
        const output = await this.#client.Runtime.evaluate({
            expression: script
        });
        return Promise.resolve(output);
    }

    async #clickPlace(n=1)
    {
        const r = await this.#executeScript(`clickPlace(${n});`);
        return Promise.resolve();
    }

    async #getPlaceListLength()
    {
        const r = await this.#executeScript(`return getPlaceListLength();`);
        return Promise.resolve(r["result"]["value"]);
    }

    async #loadingPlaces()
    {
        const r = await this.#executeScript(`return loadingPlaces();`);
        return Promise.resolve(r["result"]["value"]);
    }

    async #getPlacesID()
    {
        const r = await this.#executeScript(`return getPlacesID();`);
        try {
            return Promise.resolve(JSON.parse(r["result"]["value"]));
        }
        catch {
            console.log("Excepcion en getPlacesID");
            console.log(r);
            return [];
        }
    }

    #isIDRegistered(underscoreID)
    {
        return this.#idsFile.includes(underscoreID);
    }

    async scrape()
    {
        // if (!search || typeof(search) != "string")
        //     return Promise.reject();

        return new Promise((resolve, reject) => {

            this.#connectChrome()
            .then(
                async () => {
                    await this.#setHooks();
                    resolve();
                }
            )
            .catch(reject);
        });
    }

    async #connectChrome()
    {
        return new Promise((resolve, reject) => {

            CDP()
            .then(c => {
                this.#client = c;
                resolve();
            })
            .catch(reject);
        });        
    }

    async #setHooks()
    {
        const { Network, Page, DOM, Input, Runtime } = this.#client;

        Network.requestWillBeSent((params) => {
            if (params.request.url.includes("/maps/preview/place"))
                this.#place_request_id = params.requestId;
        });

        Network.loadingFinished(params => {
            if (params.requestId == this.#place_request_id)
                Network.getResponseBody({requestId: params.requestId})
                .then(this.#handlePlaceResponse.bind(this))
                .catch(console.error);
        });

        await Network.enable();
        await Page.enable();
        await DOM.enable();
        await Runtime.enable();

        // this.#keyboard = new Keyboard(Input);
    
        /*
        Page.loadEventFired()
        .then(this.#onPageLoad.bind(this))
        .catch(console.error);
        */

        this.#run();

        // await Page.navigate({url: "https://www.google.com/maps/search/"});
        return Promise.resolve();
    }

    async #run()
    {
        // Scrollear hasta el final

        /*
        let placeCount = await this.#getPlaceListLength();

        // agregar que si se buguea empezar igual

        while (true)
        {
            await this.#scrollPlaceList();
            await sleep(500);
            
            let newPlaceCount = await this.#getPlaceListLength();
            const isLoading = await this.#loadingPlaces();

            if (placeCount == newPlaceCount && !isLoading)
                break;
            
            placeCount = newPlaceCount;
        }*/

        // Clickear todos los botones

        const tempIDS = [];

        while (true)
        {
            const placesID = await this.#getPlacesID();
            
            for (let i = 1; i <= placesID.length; i++)
            {
                const underscoreID = placesID[i-1].replace(":", "_");

                if (!this.#isIDRegistered(underscoreID) && !tempIDS.includes(underscoreID))
                {
                    tempIDS.push(underscoreID);
                    this.#clickPlace(i);

                    await Promise.any([
                        events.once(this.#eventManager, "placeData"),
                        sleep(1000*3)
                    ]);
                }
            }
            
            await sleep(200);
        }
    }

    async #onPageLoad()
    {
        /*
        const { DOM } = this.#client;

        const docNodeId = (await DOM.getDocument()).root.nodeId;
        const searchInput = (await DOM.querySelector({
            nodeId: docNodeId,
            selector: "#searchboxinput"
        })).nodeId;

        await DOM.focus({
            nodeId: searchInput
        });

        // wait this.#keyboard.writeText(this.#search);
        // this.#keyboard.intro();

        await sleep(1000*3);
        let placeListLength = await this.#getPlaceListLength();
        while (true)
        {
            // Scroll till end of place list

            this.#scrollPlaceList();
            await sleep(1000*2);

            const temp = await this.#getPlaceListLength();
            if (placeListLength == temp)
                break;

            if (temp > 25)
                break;

            placeListLength = await this.#getPlaceListLength();
        }

        for (let n = 1; n <= placeListLength; n++)
        {
            await this.#clickPlace(n);
            await sleep(1000*1.5);
        }
        */
    }

    #parsePlaceData(responseBody)
    {
        try
        {
            const withoutMagic = responseBody.slice(5);
            const placeObj = JSON.parse(withoutMagic);
            return placeObj;
        }
        catch
        {
            return null;
        }
    }

    #savePlace(placeData)
    {
        const dataStr = JSON.stringify(placeData, null, 3);

        const underscoreID = placeData.id.replace(":", "_");


    
        let fullPath = path.join(this.#config.data_folder, underscoreID);

        return new Promise((resolve, reject) => {

            fs.writeFile(fullPath, dataStr, err => {
                if (err)
                    reject(new Error("Error while saving data in disk"));
                else
                {
                    this.#idsFile.push(underscoreID);
                    fs.writeFileSync(path.join(this.#config.data_folder, idsFileName), JSON.stringify(this.#idsFile));
                    resolve();
                }
            });
        });
    }

    async #handlePlaceResponse(responseData)
    {
        const responseBody = responseData.body;
        const placeObj = this.#parsePlaceData(responseBody);

        if (!placeObj)
            throw new Error("Error while parsing placeObj data");

        const placeData = GMapsScraper.extractData(placeObj);

        if (!placeData)
            throw new Error("Error while extracting placeObj data")

        this.#eventManager.emit("placeData");

        if (placeData.web_url)
            placeData.emails = await emails.findEmails(placeData.web_url);

        this.#savePlace(placeData)
        .then()
        .catch(
            error => {
                throw error;
            }
        );
    }
}

GMapsScraper.extractData = function(placeObj) {
    try
    {
        let data = {};

        data.name = placeObj[6]?.[11];
        data.address = placeObj[6]?.[2];
        data.category = placeObj[6]?.[13];
        data.phone = placeObj[6]?.[178]?.[0]?.[1]?.[1]?.[0];
        data.openHours = [];

        let objHorarios;
        const objHorariosStr = JSON.stringify(placeObj[6]?.[34]?.[1])?.replaceAll("\u2013", "-");
        if (objHorariosStr)
            objHorarios = JSON.parse(objHorariosStr);
        
        if (objHorarios)
            for (let day of objHorarios)
                data.openHours.push({
                    "day": day?.[0],
                    "hours": day?.[1]
                });

        data.reviewCount = Number(placeObj[6]?.[4]?.[8]);
        data.stars = Number(placeObj[6]?.[4]?.[7]);
        data.web_url = placeObj[6]?.[7]?.[0] || null;

        data.currentState = placeObj[6]?.[34]?.[4]?.[4];
        data.id = placeObj[6]?.[10];

        data.description = placeObj[6]?.[101]
                            || placeObj[6]?.[32]?.[1]?.[1];

        data.reviews = [];
        data.amenities = [];
        data.accessibility = [];

        const commentsObj = placeObj[6]?.[52]?.[0];
        if (commentsObj)
            for (let comment of commentsObj)
                data.reviews.push({
                    person: {
                        name: comment[0][1]
                    },
                    url: comment[0][0],
                    timeAgo: comment[1],
                    texto: comment[3]
                });

        const accessibilityObj = placeObj[6]?.[100]?.[1]?.[0]?.[2];
        if (accessibilityObj)
            for (const characteristic of accessibilityObj)
                data.accessibility.push(characteristic[1]);

        const amenities = placeObj[6]?.[100]?.[1]?.[1]?.[2];
        if (amenities)
            for (const amenitie of amenities)
                data.amenities.push(amenitie[1]);

        return data;
    }
    catch(e)
    {
        return null;
    }
}

exports.GMapsScraper = GMapsScraper;
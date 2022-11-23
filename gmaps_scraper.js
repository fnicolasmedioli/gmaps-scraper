const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");
const events = require("events");
const { Keyboard } = require("./keyboard.js");
const emails = require("./emails.js");

const idsFileName = "AAA_id.json";

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
    #place_request_id;
    #config;
    #domScript;
    #eventManager;
    #idsFile;
    #clickCount;

    constructor(cfg)
    {
        this.#config = {
            data_folder: "./data/"
        };

        this.#clickCount = {};

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
        this.#eventManager.setMaxListeners(0);
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

    async #scrollAntiBug()
    {
        this.#client.Input.dispatchMouseEvent({
            type: "mouseWheel",
            x: 0,
            y: 200,
            deltaX: 0,
            deltaY: -150
        });
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

    async #clickPlace(id)
    {
        const r = await this.#executeScript(`clickPlace("${id}");`);
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

        this.#run();

        return Promise.resolve();
    }

    async #run()
    {
        while (true)
        {
            const placesID = await this.#getPlacesID();

            let clickedSomething = false;
            
            for (let i = 1; i <= placesID.length; i++)
            {
                if (!(placesID[i-1] in this.#clickCount))
                    this.#clickCount[placesID[i-1]] = 0;

                const underscoreID = placesID[i-1].replace(":", "_");

                if (this.#clickCount[placesID[i-1]] < 4 && !this.#isIDRegistered(underscoreID))
                {
                    this.#clickPlace(placesID[i-1]);
                    this.#clickCount[placesID[i-1]]++;

                    await Promise.any([
                        events.once(this.#eventManager, "placeData"),
                        sleep(1000*3)
                    ]);

                    clickedSomething = true;
                    break;
                }
            }

            if (!clickedSomething)
            {
                this.#scrollPlaceList();
                await sleep(100);
                this.#scrollAntiBug();
            }
            
            await sleep(500);
        }
    }

    async #onPageLoad()
    {

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

        if (placeData.web)
        {
            placeData.emails = await emails.findEmails(placeData.web);
            if (placeData.emails.length > 0)
                console.log("Emails encontrados para " + placeData.nombre + ": " + JSON.stringify(placeData.emails));
        }
        else
            placeData.emails = [];

        this.#savePlace(placeData)
        .then(() => {
            console.log("Info de: \"" + placeData.nombre + "\" guardada");
        })
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

        data.nombre = placeObj[6]?.[11];
        data.direccion = placeObj[6]?.[2];
        data.categoria = placeObj[6]?.[13];
        data.telefono = placeObj[6]?.[178]?.[0]?.[1]?.[1]?.[0];
        data.horarios = [];

        let objHorarios;
        const objHorariosStr = JSON.stringify(placeObj[6]?.[34]?.[1])?.replaceAll("\u2013", "-");
        if (objHorariosStr)
            objHorarios = JSON.parse(objHorariosStr);
        
        if (objHorarios)
            for (let day of objHorarios)
                data.horarios.push({
                    "dia": day?.[0],
                    "hora": day?.[1]
                });

        data.cantidad_valoraciones = Number(placeObj[6]?.[4]?.[8]);
        data.estrellas = Number(placeObj[6]?.[4]?.[7]);
        data.web = placeObj[6]?.[7]?.[0] || null;

        data.estado_actual = placeObj[6]?.[34]?.[4]?.[4];
        data.id = placeObj[6]?.[10];

        data.descripcion = placeObj[6]?.[101]
                            || placeObj[6]?.[32]?.[1]?.[1];

        data.valoraciones_destacadas = [];
        data.comodidades = [];
        data.accesibilidad = [];

        const commentsObj = placeObj[6]?.[52]?.[0];
        if (commentsObj)
            for (let comment of commentsObj)
                data.valoraciones_destacadas.push({
                    nombre_persona: comment[0][1],
                    url_comentario: comment[0][0],
                    antiguedad: comment[1],
                    texto: comment[3]
                });

        const accessibilityObj = placeObj[6]?.[100]?.[1]?.[0]?.[2];
        if (accessibilityObj)
            for (const characteristic of accessibilityObj)
                data.accesibilidad.push(characteristic[1]);

        const amenities = placeObj[6]?.[100]?.[1]?.[1]?.[2];
        if (amenities)
            for (const amenitie of amenities)
                data.comodidades.push(amenitie[1]);

        return data;
    }
    catch(e)
    {
        return null;
    }
}

exports.GMapsScraper = GMapsScraper;
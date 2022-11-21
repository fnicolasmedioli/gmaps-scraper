function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class Keyboard {

    #Input;

    constructor(inputObj)
    {
        this.#Input = inputObj;
    }

    #insertChar(c)
    {
        if (c.length != 1)
            throw new Error();

        this.#Input.dispatchKeyEvent({
            type: "keyDown",
            text: c
        });
    }

    async writeText(text)
    {
        if (!text)
            return Promise.reject();

        for (let c of text)
        {
            this.#insertChar(c);
            await sleep(1000*0.15);
        }
        return Promise.resolve();
    }

    async backspace(n=1)
    {
        for (let i = 0; i < n; i++)
        {
            this.#Input.dispatchKeyEvent({
                type: "keyDown",
                windowsVirtualKeyCode: 8,
                nativeVirtualKeyCode: 8
            });
            await sleep(1000*0.10);
        }
        return Promise.resolve();
    }

    intro()
    {
        this.#Input.dispatchKeyEvent({
            type: "keyDown",
            windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13
        });
    }
}

exports.Keyboard = Keyboard;
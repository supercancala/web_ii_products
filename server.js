const express = require("express")
const fs = require("fs")

const app = express()

app.use(express.json())
app.use(express.urlencoded()) // middleware

app.get("/products", (req, res) => {
    const {count, products} = JSON.parse(fs.readFileSync("./products.json", {encoding:"utf-8"})) 
    
    const {category, subcategory, search } = req.query
    
    let filteredProducts = products.filter(product => {
        const matchesCategory = !category || product.category === category;
        const matchesSubcategory = !subcategory || product.subcategory === subcategory;
        const matchesSearch = !search || product.name.toLowerCase().includes(search.toLowerCase());
        
        return matchesCategory && matchesSubcategory && matchesSearch;
    });
    res.json(filteredProducts);
})

app.post('/products', (req, res) => {
    let {count, products} = JSON.parse(fs.readFileSync("./products.json", {encoding:"utf-8"}));
    
    let { name, category, subcategory, price, currency, stock, rating } = req.body
    const id = count + 1001;
    
    const newProductObject = {
        id,
        name,
        category,
        subcategory,
        price,
        currency,
        stock,
        rating
    };
    
    products.push(newProductObject);
    
    try {
        fs.writeFileSync('./products.json', JSON.stringify({
            count: count + 1, 
            products: products
        }, null, 2))
        res.status(201).json(
            {
                message: "Product added successfully",
                newId: id
            }
        );
    } catch (e){
        console.log('error');
        res.status(400).json({
            error: "Failed to write to file"
        });
        throw e;
    }
})

app.put('/products/:id', (req, res) => {
    const { body, params:{id} } = req;
    const parsedId = parseInt(id)

    let {count, products} = JSON.parse(fs.readFileSync("./products.json", {encoding:"utf-8"}));
    const { name, category, subcategory, price, currency, stock, rating } = body;
    
    // Fetch product index
    const foundProductIndex = products.findIndex((product) => product.id === parsedId);

    if (foundProductIndex < 0) {
        res.status(404).json({ error : `Could not find item with id ${id}.`})
        console.log(`Could not find item with id ${id}.`);
        return;
    }

    const updatedProductObject = {
        id: parsedId,
        name,
        category,
        subcategory,
        price,
        currency,
        stock,
        rating
    };

    products[foundProductIndex] = updatedProductObject;

    try {
            fs.writeFileSync('./products.json', JSON.stringify({
                count: count, 
                products: products
            }, null, 2))
            res.status(200).json({ msg: `Product with id ${id} was successfully modified.`})
    } catch (e) {
        console.log('error');
        res.status(400).json({
            error: "Failed to update to products"
        });
        throw e;
    }
})

app.listen(9000, () => console.log("Server running on port 9000"))
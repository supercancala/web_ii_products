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
    const {count, products} = JSON.parse(fs.readFileSync("./products.json", {encoding:"utf-8"}));
    
    const { name, category, subcategory, price, currency, stock, rating } = req.body
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
})

app.listen(9000, () => console.log("Server running on port 9000"))
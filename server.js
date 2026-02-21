const express = require("express")
const fs = require("fs")
const { sequelize, Sequelize, DataTypes } = require('sequelize');

const MySqlDialect = require('@sequelize/mysql');
const { subscribe } = require("diagnostics_channel");

let dotenv = require('dotenv').config();

const app = express()

app.use(express.json())
app.use(express.urlencoded()) // middleware

// Routers for SQL and FS CRUDs
const fsRouter = express.Router();
const sqlRouter = express.Router();


const conn = new Sequelize('products_db', 'root','13572468', {
    dialect: 'mysql',
    host: 'localhost',
    port: 3306,
    showWarnings: true,
    connectTimeout: 1000,
});

// Models 

const Category = conn.define('Category',
    {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        }
    }
);

const Subcategory = conn.define('Subcategory',
    {
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        category_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    }
)

const Product = conn.define('Product',
    {
        name: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false,
        },
        subcategory_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        price: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0.0
        },
        currency: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'USD'
        },
        stock: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        rating: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0.0
        }  
    }
)

// Model relations

Subcategory.belongsTo(Category, {
    foreignKey: 'category_id'
});

Product.belongsTo(Subcategory, {
    foreignKey: 'subcategory_id'
});

const checkProductExistanceFs = (req, res, next) =>{
    // logica para buscar el producto
    let { id } = req.params;
    id = parseInt(id);

    const { products } = JSON.parse(fs.readFileSync("./products.json", {encoding:"utf-8"}));
    
    const foundProductIndex = products.findIndex((product) => product.id === id);

    // si falla responder 404, sino, next
    if (foundProductIndex < 0) {
        res.status(404).json(
            {
                message: "Error: Product not found"
            }
        );
        console.log("Could not find product with id:", id);
        return;
    }
    next();
}

const checkProductExistanceSql = async (req, res, next) => {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ message: "Not found" });
    
    req.product = product; 
    next();
};

const checkPayload = (req, res, next) => {
    const { name, category, subcategory, price, currency } = req.body;
    let { stock, rating } = req.body;

    // Undefined checks
    if (!name || typeof name !== 'string' || name.trim() === "") {
        return res.status(400).json({ error: "Valid product name is required" });
    }
    if (!category || typeof category !== 'string' || category.trim() === "") {
        return res.status(400).json({ error: "Valid category name is required" });
    }
    if (!subcategory || typeof subcategory !== 'string' || subcategory.trim() === "") {
        return res.status(400).json({ error: "Valid subcategory name is required" });
    }
    if (typeof price !== 'number' || price < 0) return res.status(422).json({ message: "Price must be a valid postive number" });
    if (!currency || typeof currency !== 'string' || currency.trim() === "") {
        return res.status(400).json({ error: "Valid currency  is required" });
    }
    
    // 0 if rating is undefined or invalid
    req.body.rating = (rating === undefined || rating < 0 || rating > 5) ? 0 : rating; 
    req.body.stock = stock ?? 0; // If undefined use 0

    next();
}

checkSqlUpdatePayload = (req, res, next) => {
    const { name, category, subcategory, price, currency, stock, rating } = req.body;

    // String validation 
    if (name !== undefined && (typeof name !== 'string' || name.trim() === "")) {
        return res.status(400).json({ error: "Name must be a non-empty string" });
    }
    if (category !== undefined && (typeof category !== 'string' || category.trim() === "")) {
        return res.status(400).json({ error: "Category must be a non-empty string" });
    }
    if (subcategory !== undefined && (typeof subcategory !== 'string' || subcategory.trim() === "")) {
        return res.status(400).json({ error: "Subcategory must be a non-empty string" });
    }
    if (currency !== undefined && (typeof currency !== 'string' || currency.trim() === "")) {
        return res.status(400).json({ error: "Currency must be a non-empty string" });
    }

    // Number validations
    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
        return res.status(422).json({ error: "Price must be a positive number" });
    }
    if (stock !== undefined && (typeof stock !== 'number' || stock < 0)) {
        return res.status(422).json({ error: "Stock cannot be negative" });
    }
    if (rating !== undefined && (typeof rating !== 'number' || rating < 0 || rating > 5)) {
        return res.status(422).json({ error: "Rating must be between 0 and 5" });
    }

    // Check if body is empty
    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "Update body cannot be empty" });
    }

    next();
}

const modifyProducts = (count, nextId, products) => {
    fs.writeFileSync('./products.json', JSON.stringify({
            count: count + 1, 
            nextId,
            products
        }, null, 2))
}

const filterProducts = (products, category, subcategory, search) => {
    const filteredProducts = products.filter(p => {
        const matchesCategory = !category || p.category === category;
        const matchesSubcategory = !subcategory || p.subcategory === subcategory;
        const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
        
        return matchesCategory && matchesSubcategory && matchesSearch;
    });
    return filteredProducts;
} 

const buildProductObjectSql = async (name, category, subcategory, price, currency, stock, rating) => {
    const [categoryInstance] = await Category.findOrCreate({
        where: {name: category}
    });

    const [subcategoryInstance] = await Subcategory.findOrCreate({
        where: {name: subcategory, category_id: categoryInstance.id}
    });

    return {
        name: name,
        subcategory_id: subcategoryInstance.id,
        price: price,
        currency: currency,
        stock: stock,
        rating: rating
    }
}

const getUniqueCategories = (jsonProducts) => {
    const categorySet = new Set(jsonProducts.map(p => p.category));
    return [...categorySet].map((c => ({"name": c})));
}

const createLookupMap = (dbRecords) => {
    // Works for either categories or subcategories !!!
    return new Map(dbRecords.map(record => ([record.name, record.id])))
}

const getSubcategoryMap = (categoryPairs, categoryMap) => {
    const subcategoryMap = new Map();
    for (const pair of categoryPairs){
        subcategoryMap.set(pair.subcategory, categoryMap.get(pair.category));
    }
    return subcategoryMap
}

const getNamePairs = (jsonProducts) => {
    const categoryPair = [];
    for (const product of jsonProducts){
        if (!categoryPair.some(pair => pair.subcategory === product.subcategory)){
            categoryPair.push({ subcategory: product.subcategory, category: product.category });
        }
    }
    return categoryPair
}

const getUniqueSubcategories = (jsonProducts, dbCategories) => {
    const namePairs = getNamePairs(jsonProducts)
    const categoryToIdMap = createLookupMap(dbCategories);
    const subcategoryToCatIdMap = getSubcategoryMap(namePairs, categoryToIdMap);
    const subcategoryObjects = [];

    for (const [subcategory, category_id] of subcategoryToCatIdMap){
        subcategoryObjects.push({ name: subcategory, category_id: category_id})
    }

    return subcategoryObjects;
}

const getProducts = (jsonProducts, subcategories) => {
    const subcategoryToIdMap = createLookupMap(subcategories);
    return jsonProducts.map(p => ({
        name: p.name,
        price: p.price,
        currency: p.currency,
        stock: p.stock,
        rating: p.rating,
        subcategory_id: subcategoryToIdMap.get(p.subcategory)
    }));
}

async function seedDatabase(){
    if (!process.argv.includes('--seed')) return;
    
    const { products: jsonProducts } = JSON.parse(fs.readFileSync('./products.json', {encoding:"utf-8"}));
    const categoryObjects = getUniqueCategories(jsonProducts);
    const dbCategories = await Category.bulkCreate(categoryObjects);

    const subcategoryObjects = getUniqueSubcategories(jsonProducts, dbCategories);
    const dbSubcategories = await Subcategory.bulkCreate(subcategoryObjects);

    const productObjects = getProducts(jsonProducts, dbSubcategories);
    const dbProducts = await Product.bulkCreate(productObjects);

    console.log("Data seeded successfully!");
}

// File System CRUD route
fsRouter.get("/products", (req, res) => {
    const {products} = JSON.parse(fs.readFileSync("./products.json", {encoding:"utf-8"})) 
    
    const {category, subcategory, search } = req.query
    
    res.json(filterProducts(products, category, subcategory, search));
})

fsRouter.get("/products/:id", checkProductExistanceFs, (req, res) => {
    const { id } = req.params
    let { products } = JSON.parse(fs.readFileSync("./products.json", {encoding:"utf-8"}));

    productIndex = products.findIndex(p => p.id === id);

    res.status(200).json(products[productIndex]);
});

fsRouter.post('/products', checkPayload, (req, res) => {
    let {count, products, nextId} = JSON.parse(fs.readFileSync("./products.json", {encoding:"utf-8"}));
    nextId = parseInt(nextId);
    
    let { name, category, subcategory, price, currency, stock, rating } = req.body
    const id = nextId;
    nextId = ++nextId;
    
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
        modifyProducts(count, nextId, products);
        res.status(201).json(
            {
                message: "Product added successfully",
                newId: id
            }
        );
    } catch (e){
        console.log('Error modifying products');
        res.status(400).json({
            error: "Failed to write to file"
        });
        throw e;
    }
})

fsRouter.put('/products/:id', checkPayload, checkProductExistanceFs, (req, res) => {
    const { body, params:{id} } = req;
    const parsedId = parseInt(id);

    let {count, nextId, products} = JSON.parse(fs.readFileSync("./products.json", {encoding:"utf-8"}));
    const { name, category, subcategory, price, currency, stock, rating } = body;
    
    // Fetch product index

    const updatedProductObject = {
        id,
        name,
        category,
        subcategory,
        price,
        currency,
        stock,
        rating
    };

    productIndex = products.findIndex(p => p.id === parsedId);

    products[productIndex] = updatedProductObject;

    try {
        modifyProducts(count, nextId, products);
        res.status(200).json({ msg: `Product with id ${id} was successfully modified.`})
    } catch (e) {
        console.log('error');
        res.status(400).json({
            error: "Failed to update to products"
        });
        throw e;
    }
});

fsRouter.delete('/products/:id', checkProductExistanceFs, (req, res) => {
    let { id } = req.params;
    id = parseInt(id);
    let { count, nextId, products } = JSON.parse(fs.readFileSync('./products.json', {encoding:"utf-8"}));
    
    productIndex = products.findIndex(p => p.id === id);

    products.splice(productIndex, 1);

    try {
        modifyProducts(count, nextId, products);
        console.log("Successfully deleted product with id:", id);
        res.status(204).json({ msg: `Product with id ${id} was successfully deleted.`})
    } catch (e) {
        console.log('error');
        res.status(400).json({
            error: "Failed to update to products"
        });
        throw e;
    }
});

// SQL CRUD routes

sqlRouter.get('/products', async (req, res) => {
    const searchWhereClause = {};
    const { category, subcategory, search } = req.query

    if (search) {
        searchWhereClause.name = { [Op.substring]: search};
    }
    
    let products = []

    try {
        products = await Product.findAll({
            where: searchWhereClause,
            include: [{
                model: Subcategory,
                where: subcategory ? {name: subcategory} : {},
                include: [{
                    model: Category,
                    where: category ? {name: category} : {}
                }]
            }]
        });
    } catch (error) {
        console.error(error)
        res.status(500).send("Internal server error");
    }

    res.json(products);
});

sqlRouter.get("/products/:id", checkProductExistanceSql, (req, res) => {
    res.status(200).json(req.product);
}); 

sqlRouter.post("/products", checkPayload, async (req, res) => {
    const { name, category, subcategory, price, currency, stock, rating } = req.body
    
    const newProductObject = await buildProductObjectSql(name, category, subcategory, price, currency, stock, rating);

    try {
        Product.create(newProductObject);
        res.status(201).json({
            message: "Prodcuts added to database successfully"
        });
    } catch (error) {
        console.log("Error while creating new prodcut");
        res.status(400).json({
            error: "Failed to create new product"
        })
    }
})

sqlRouter.put('/products/:id', checkSqlUpdatePayload, checkProductExistanceSql, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, category, subcategory, price, currency,stock,rating} = req.body;

    const modifiedProduct = await buildProductObjectSql(name, category, subcategory, price, currency, stock, rating);

    try {
        await req.product.update(modifiedProduct);
        res.status(200).json({ message: `Product with id ${id} was successfully modified in the database`});
    } catch (error) {
        console.log("Error updating product");
        res.status(400).json({
            error: "Failed to update product"
        })
    }
})

sqlRouter.delete('/products/:id', checkProductExistanceSql, (req, res) => {
    try{
        req.product.destroy();
        res.status(204).json( {messsage: "Product successfully eliminated from database"});
    } catch (error) {
        console.log("Error when deleting product from database");
        res.status(400).json({
            error: "Error deleting product from database"
        });
    }
})

app.use('/fs', fsRouter);
app.use('/sql', sqlRouter);

conn.sync().then(async () => {
    console.log("Database & tables created!");
    
    await seedDatabase(); // Only runs with '--seed' flag
    
    app.listen(9000, () => console.log("Server running on port 9000"));
});
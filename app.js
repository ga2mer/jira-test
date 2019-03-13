const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const config = require('config');
const multer = require('multer');
const upload = multer({storage: multer.diskStorage({
    destination: function (req, file, callback) { callback(null, './uploads');},
    filename: function (req, file, callback) { callback(null, Date.now() + '-' + file.originalname);}})
});

const urlencodedParser = bodyParser.urlencoded({ extended: false });

const JiraClient = require('jira-connector');

const jira = new JiraClient({
    host: config.get('host'),
    basic_auth: config.get('auth'),
});

app.get('/', (req, res) => {
    res.send(`
  <html>
    <head>
        <title>Main</title>
    </head>
    <body>
        <div><a href="/projects">Проекты JSON</a></div>
        <div><a href="/projects.html">Проекты WEB</a></div>
        <div><a href="/create.html">Создать задачу</a></div>
    </body>
  </html>
  `);
});

app.get('/projects.html', async (req, res) => {
    try {
        const result = await jira.project.getAllProjects();
        if (result.length > 0) {
            let str = '';
            result.forEach((item) => {
                str += `<div><a href="/issues/${item.key}">${item.name} JSON</a> <a href="/issues/${item.key}.html">${item.name} WEB</a></div>`
            })
            res.send(str);
        } else {
            res.send('Проектов не найдено');
        }
    } catch (e) {
        res.send(e);
    }
});
app.get('/projects', async (req, res) => {
    try {
        const result = await jira.project.getAllProjects();
        res.json(result.map((item) => ({key: item.key, name: item.name})));
    } catch (e) {
        res.json(e);
    }
});

app.get('/issues/:project.html', async (req, res) => {
    try {
        const result = await jira.search.search({
            project: req.params.project,
            maxResults: -1,
        })
        let prettifiedString = `<details><summary>Raw json</summary><code>${JSON.stringify(result)}</code></details>`;
        result.issues.forEach((item) => {
            prettifiedString += `<div><a href="/issue/${item.key}">[${item.key}] ${item.fields.summary} JSON</a> <a href="/issue/${item.key}.html">[${item.key}] ${item.fields.summary} WEB</a></div>`;
        })
        res.send(prettifiedString);
    } catch (e) {
        res.send(e);
    }
});

app.get('/issues/:project', async (req, res) => {
    try {
        const result = await jira.search.search({
            project: req.params.project,
            maxResults: -1,
        })
        res.json(result);
    } catch (e) {
        res.json(e);
    }
});

app.get('/issue/:id.html', async (req, res) => {
    try {
        const result = await jira.issue.getIssue({
            issueKey: req.params.id,
        });
        res.send(result.fields.summary);
    } catch (e) {
        res.send(e);
    }
});

app.get('/issue/:id', async (req, res) => {
    try {
        const result = await jira.issue.getIssue({
            issueKey: req.params.id,
        });
        res.json(result);
    } catch (e) {
        res.json(e);
    }
});

app.get('/create.html', async (req, res) => {
    const rawIssueTypes = await jira.issueType.getAllIssueTypes();
    const issueTypes = rawIssueTypes.map((item) => item.name);
    const rawProjects = await jira.project.getAllProjects();
    const rawLabels = await jira.labels.getLabels({ query: '' });
    const labels = rawLabels.suggestions.map((item) => item.label);
    const rawAssignable = await jira.user.multiProjectSearchAssignable({ projectKeys: rawProjects.map((item) => item.key) });
    // const components = await jira.component.getComponent
    res.send(`<form action="/create" method="post" enctype="multipart/form-data">
        <div>Проект: <select name="project">${rawProjects.map((item) => `<option value="${item.key}">${item.name}</option>`)}</select></div>
        <div>Тип: <select name="issuetype">${issueTypes.map((item) => `<option value="${item}">${item}</option>`)}</select></div>
        <div>Название: <input type="text" name="title"/></div>
        <div>Описание: <input type="text" name="description"/></div>
        <div>Метки: <select name="labels" multiple>${labels.map((item) => `<option value="${item}">${item}</option>`)}</select>
        <div>Номер в QuickFix: <input type="text" name="quickfix"/></div>
        <div>Исполнитель: <select name="assignee">${rawAssignable.map((item) => `<option value="${item.name}">${item.displayName}</option>`)}</select></div>
        <div>Вложение: <input type="file" name="file" /></div>
        <div><input type="submit" value="Создать" /></div>
    </form>`)
});

app.post('/create', upload.single('file'), async (req, res) => {
    // console.log(req.body.title, req.body.description);
    console.log(req.file);
    try {
        console.log(req.body);
        const obj = {
            fields: {
                project: {
                    key: req.body.project
                },
                summary: req.body.title,
                description: req.body.description,
                issuetype: {
                    name: req.body.issuetype,
                },
                labels: typeof req.body.labels == 'string' ? Array(req.body.labels) : req.body.labels || [],
                customfield_10201: req.body.quickfix,
                assignee: {
                    name: req.body.assignee,
                },
            }
        };
        if (req.body.components) {
            if (typeof req.body.components == 'string') {
                obj.fields.components = [{
                    name: req.body.components,
                }];
            } else {
                obj.fields.components = req.body.components.map((item) => ({name: item}));
            }
        }
        const result = await jira.issue.createIssue(obj);
        console.log(result);
        if (req.file) {
            const result2 = await jira.issue.addAttachment({
                issueKey: result.key,
                filename: req.file.path,
            });
            console.log(result2);
        }
        res.send('ok');
    } catch (e) {
        console.log(e);
        res.send(e);
    }
});

app.listen(1337, () => {
    console.log('App listening on port 1337');
});
// Counter app - intentionally broken (missing closing parenthesis)
let counter = 0;

function increment() {
    counter++;
    document.getElementById('counter').textContent = counter;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn').addEventListener('click', increment);
});

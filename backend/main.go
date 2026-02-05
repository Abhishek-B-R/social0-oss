package main

import (
	"log"
	"net/http"

	"github.com/Abhishek-B-R/social0/backend/app"
	"github.com/go-chi/chi/v5"
)

func main() {
	app, err := app.NewApplication()
	if err != nil {
		log.Fatal(err)
	}
	defer app.DB.Close()

	r := chi.NewRouter()
	r.Get("/health", app.HealthCheck)
	http.ListenAndServe(":8080", r)
}
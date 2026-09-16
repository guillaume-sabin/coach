import XCTest

/// Parcours de fumée de l'interface : l'app est lancée avec `--ui-testing` (données de démonstration,
/// aucun accès à Santé ni au réseau). Chaque écran visité est capturé et joint au résultat.
final class CoachUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments += ["--ui-testing"]
        app.launch()
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testWorkoutsListAndDetail() {
        XCTAssertTrue(app.navigationBars["Séances"].waitForExistence(timeout: 15), "l'onglet Séances doit s'afficher au lancement")
        XCTAssertTrue(app.staticTexts["Toutes les séances"].waitForExistence(timeout: 5))
        capture("01-seances")

        let row = app.cells.matching(NSPredicate(format: "label CONTAINS[c] 'Course à pied' OR label CONTAINS[c] 'Trail'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5), "au moins une séance de course dans les données de démonstration")
        row.tap()

        let back = app.navigationBars.buttons["Séances"]
        XCTAssertTrue(back.waitForExistence(timeout: 5), "le détail est poussé dans la pile de navigation")
        capture("02-detail")
        back.tap()
        XCTAssertTrue(app.navigationBars["Séances"].waitForExistence(timeout: 5))
    }

    func testFilterMenuAndOtherTabs() {
        XCTAssertTrue(app.navigationBars["Séances"].waitForExistence(timeout: 15))

        let filter = app.navigationBars.buttons["Filtrer"]
        XCTAssertTrue(filter.waitForExistence(timeout: 5))
        filter.tap()
        let mobility = app.buttons["Mobilité"].firstMatch
        XCTAssertTrue(mobility.waitForExistence(timeout: 5))
        mobility.tap()
        XCTAssertTrue(app.staticTexts["Mobilité"].firstMatch.waitForExistence(timeout: 5), "le titre de section reflète le filtre")
        capture("03-filtre-mobilite")

        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 5))

        tabBar.buttons["Récupération"].tap()
        XCTAssertTrue(app.navigationBars["Récupération"].waitForExistence(timeout: 10))
        capture("04-recuperation")

        tabBar.buttons["Réglages"].tap()
        XCTAssertTrue(app.navigationBars["Réglages"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.switches.firstMatch.waitForExistence(timeout: 5), "le réglage d'envoi vers l'API est présent")
        XCTAssertTrue(app.buttons["Synchroniser maintenant"].exists)
        capture("05-reglages")
    }
}

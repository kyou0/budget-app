import SwiftUI

@main
struct BudgetFlowApp: App {
    @StateObject private var store = BudgetStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
        }
    }
}
